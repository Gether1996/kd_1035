from django import forms
from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied
from django.db import models
from django.shortcuts import redirect
from django.template.response import TemplateResponse
from django.urls import path
from django.utils.html import format_html
from django.utils.safestring import mark_safe

from kingdom.permissions import SuperuserOnlyAdmin

from .armory import armory
from .models import CommanderFormation, CommanderPair, Guide, GuideImage
from .pairs import check_rows, known_name, merge_pairs, pair_rows, parse_lines, replace_pairs

PREVIEW_STYLE = (
    'max-height:520px;overflow:auto;padding:20px 24px;border-radius:10px;'
    'background:#0b1730;color:#eaf0fa;font:15px/1.6 system-ui,sans-serif'
)


def _content_edited(form) -> bool:
    """Real edits of title/HTML – browsers send textareas with CRLF, which alone is no change."""

    def normalize(value):
        return (value or '').replace('\r\n', '\n').strip()

    fields = {'title_sk', 'title_cs', 'html_sk', 'html_cs'} & set(form.changed_data)
    return any(normalize(form.initial.get(f)) != normalize(form.cleaned_data.get(f)) for f in fields)


class GuideImageInline(admin.TabularInline):
    model = GuideImage
    extra = 1
    fields = ['image', 'thumbnail', 'snippet']
    readonly_fields = ['thumbnail', 'snippet']

    @admin.display(description='náhľad')
    def thumbnail(self, obj):
        if not obj.pk:
            return '—'
        return format_html('<img src="{}" style="max-height:60px;border-radius:6px">', obj.image.url)

    @admin.display(description='kód do HTML (klikni a skopíruj)')
    def snippet(self, obj):
        if not obj.pk:
            return 'Po uložení sa tu zobrazí kód obrázka.'
        code = f'<img src="{obj.image.url}" alt="">'
        return format_html(
            '<input type="text" readonly value="{}" onclick="this.select()" '
            'style="width:100%;min-width:320px;font-family:monospace">',
            code,
        )


@admin.register(Guide)
class GuideAdmin(SuperuserOnlyAdmin, admin.ModelAdmin):
    list_display = ['title_sk', 'category', 'specialty', 'is_published', 'auto_update', 'order', 'updated_at']
    list_display_links = ['title_sk']
    list_editable = ['is_published', 'order']
    list_filter = ['category', 'specialty', 'is_published', 'auto_update']
    search_fields = ['title_sk', 'title_cs', 'html_sk']
    prepopulated_fields = {'slug': ['title_sk']}
    readonly_fields = ['preview']
    inlines = [GuideImageInline]
    save_on_top = True
    fieldsets = [
        (None, {'fields': ['category', 'specialty', 'title_sk', 'title_cs', 'slug', 'is_published', 'auto_update', 'order']}),
        ('Obsah – slovensky', {'fields': ['html_sk', 'preview']}),
        ('Obsah – česky (nepovinné)', {'fields': ['html_cs'], 'classes': ['collapse']}),
    ]
    formfield_overrides = {
        models.TextField: {
            'widget': forms.Textarea(
                attrs={'rows': 26, 'style': 'width:100%;font-family:ui-monospace,Consolas,monospace;font-size:13px'}
            )
        },
    }

    def save_model(self, request, obj, form, change):
        # a hand edit of an auto-updated guide would be overwritten by the next meta update – stop updating it,
        # unless the superuser deliberately ticked the checkbox in the same save
        if change and obj.auto_update and 'auto_update' not in form.changed_data and _content_edited(form):
            obj.auto_update = False
            messages.info(request, 'Návod bol upravený ručne, automatická aktualizácia mety je preň vypnutá.')
        super().save_model(request, obj, form, change)

    @admin.display(description='Náhľad (po uložení)')
    def preview(self, obj):
        if not obj or not obj.html_sk:
            return '—'
        # html_sk is sanitized on save
        return format_html('<div style="{}">{}</div>', PREVIEW_STYLE, mark_safe(obj.html_sk))


class CommanderPairForm(forms.ModelForm):
    """A pair added or edited in the admin: commanders a march can name, written like the roster, two different ones.
    (The list edits only the points – the names are checked here, not in the model, so a list save never trips on
    them.)"""

    class Meta:
        model = CommanderPair
        fields = ['primary', 'secondary', 'points']

    def clean_name(self, field):
        name = known_name(self.cleaned_data[field])
        if not name:
            raise forms.ValidationError('Neznámy commander – meno ako pri marchi (napr. Ivan IV, Ivar the Boneless).')
        return name

    def clean_primary(self):
        return self.clean_name('primary')

    def clean_secondary(self):
        return self.clean_name('secondary')

    def clean(self):
        cleaned = super().clean()
        if cleaned.get('primary') and cleaned.get('primary') == cleaned.get('secondary'):
            self.add_error('secondary', 'Primárny a sekundárny musia byť dvaja rôzni commanderi.')
        return cleaned


class PairImportForm(forms.Form):
    lines = forms.CharField(
        label='Páry',
        widget=forms.Textarea(attrs={'rows': 30, 'cols': 80, 'style': 'font-family: monospace'}),
        help_text=(
            'Jeden pár na riadok: primárny; sekundárny; body (100 = plný meta pár, 0 = nehodnotí sa). Tri stĺpce '
            'z Excelu sa dajú vložiť priamo. Každé poradie páru je samostatný riadok.'
        ),
    )
    replace = forms.BooleanField(
        label='Nahradiť celú tabuľku',
        required=False,
        help_text='Zaškrtnuté = páry, ktoré tu nie sú, sa zmažú. Inak sa nové pridajú a existujúcim sa zmenia body.',
    )

    def clean_lines(self):
        rows, errors = parse_lines(self.cleaned_data['lines'])
        if errors:
            raise forms.ValidationError(errors)
        return rows


@admin.register(CommanderPair)
class CommanderPairAdmin(SuperuserOnlyAdmin, admin.ModelAdmin):
    """The commander pairs of /vyhodnocovanie (also in Premenné on the page); "Vložiť z Excelu" takes many at once."""

    list_display = ['primary', 'secondary', 'points', 'updated_at']
    list_editable = ['points']
    search_fields = ['primary', 'secondary']
    # 3 fields a row: far below the 1000 fields Django takes in one POST
    list_per_page = 200
    form = CommanderPairForm
    fields = ['primary', 'secondary', 'points']
    change_list_template = 'admin/guides/commanderpair/change_list.html'

    def get_urls(self):
        view = self.admin_site.admin_view(self.import_view)
        return [path('import/', view, name='guides_commanderpair_import'), *super().get_urls()]

    def import_view(self, request):
        if not self.has_change_permission(request) or not self.has_add_permission(request):
            raise PermissionDenied
        initial = {'lines': '\n'.join(f'{p}; {s}; {n}' for p, s, n in pair_rows())}
        form = PairImportForm(request.POST or None, initial=initial)
        if request.method == 'POST' and form.is_valid():
            rows, _ = check_rows(form.cleaned_data['lines'])
            if form.cleaned_data['replace']:
                replace_pairs(rows)
                self.message_user(request, f'Tabuľka nahradená: {len(rows)} párov.', messages.SUCCESS)
            else:
                added, changed = merge_pairs(rows)
                self.message_user(request, f'Pridané páry: {added}, zmenené body: {changed}.', messages.SUCCESS)
            return redirect('admin:guides_commanderpair_changelist')
        context = {
            **self.admin_site.each_context(request),
            'opts': self.model._meta,
            'form': form,
            'title': 'Vložiť páry z Excelu',
        }
        return TemplateResponse(request, 'admin/guides/commanderpair/import.html', context)


class CommanderFormationForm(forms.ModelForm):
    """A commander a march can name, written like the roster, and the formations of armory.json in the order ticked."""

    formations = forms.MultipleChoiceField(
        label='Formácie',
        required=False,
        widget=forms.CheckboxSelectMultiple,
        help_text='Odporúčané formácie (najviac 3). Žiadna = hocijaká formácia.',
    )

    class Meta:
        model = CommanderFormation
        fields = ['commander', 'formations']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['formations'].choices = [(f['id'], f['name']) for f in armory()['formations']]

    def clean_commander(self):
        name = known_name(self.cleaned_data['commander'])
        if not name:
            raise forms.ValidationError('Neznámy commander – meno ako pri marchi (napr. Ivan IV, Ivar the Boneless).')
        return name

    def clean_formations(self):
        chosen = self.cleaned_data['formations']
        if len(chosen) > 3:
            raise forms.ValidationError('Najviac 3 formácie.')
        return chosen


@admin.register(CommanderFormation)
class CommanderFormationAdmin(SuperuserOnlyAdmin, admin.ModelAdmin):
    """The formations of the commanders for /vyhodnocovanie (also in Premenné on the page)."""

    list_display = ['commander', 'formation_names', 'updated_at']
    search_fields = ['commander']
    form = CommanderFormationForm

    @admin.display(description='formácie')
    def formation_names(self, row):
        names = {f['id']: f['name'] for f in armory()['formations']}
        return ', '.join(names.get(f, f) for f in row.formations) or '–'
