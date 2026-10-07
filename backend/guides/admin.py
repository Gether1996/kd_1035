from django import forms
from django.contrib import admin
from django.db import models
from django.utils.html import format_html
from django.utils.safestring import mark_safe

from kingdom.permissions import SuperuserOnlyAdmin

from .models import Guide, GuideImage

PREVIEW_STYLE = (
    'max-height:520px;overflow:auto;padding:20px 24px;border-radius:10px;'
    'background:#0b1730;color:#eaf0fa;font:15px/1.6 system-ui,sans-serif'
)


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
    list_display = ['title_sk', 'category', 'is_published', 'order', 'updated_at']
    list_display_links = ['title_sk']
    list_editable = ['is_published', 'order']
    list_filter = ['category', 'is_published']
    search_fields = ['title_sk', 'title_cs', 'html_sk']
    prepopulated_fields = {'slug': ['title_sk']}
    readonly_fields = ['preview']
    inlines = [GuideImageInline]
    save_on_top = True
    fieldsets = [
        (None, {'fields': ['category', 'title_sk', 'title_cs', 'slug', 'is_published', 'order']}),
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

    @admin.display(description='Náhľad (po uložení)')
    def preview(self, obj):
        if not obj or not obj.html_sk:
            return '—'
        # html_sk is sanitized on save
        return format_html('<div style="{}">{}</div>', PREVIEW_STYLE, mark_safe(obj.html_sk))
