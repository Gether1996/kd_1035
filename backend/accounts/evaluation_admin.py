"""The variables of /vyhodnocovanie in the Django admin (Gether 13. 10. 2026: "do django admina pridať tie vyhodnocovacie
nastavenia"): the JSON as the page saves it, readable. The page's Premenné tab stays the comfortable editor; the
commander pairs are a table of their own (guides.CommanderPair, admin Návody → Páry commanderov)."""

import json

from django import forms
from django.contrib import admin
from django.forms.fields import InvalidJSONInput
from django.shortcuts import redirect

from kingdom.permissions import SuperuserOnlyAdmin

from .evaluation_views import SETTINGS_MAX_BYTES, clean_settings
from .models import EvaluationSettings


class PrettyJSONField(forms.JSONField):
    """The JSON indented, one value per line – readable in a textarea."""

    def prepare_value(self, value):
        if isinstance(value, InvalidJSONInput):
            return value
        return json.dumps(value, ensure_ascii=False, indent=2, cls=self.encoder)


class EvaluationSettingsForm(forms.ModelForm):
    data = PrettyJSONField(
        label='Premenné (JSON)',
        required=False,
        widget=forms.Textarea(attrs={'rows': 40, 'cols': 80, 'style': 'font-family: monospace'}),
        help_text=(
            'Ako ich ukladá stránka /vyhodnocovanie (záložka Premenné – tam sa upravujú pohodlnejšie). Čo chýba, doplní '
            'stránka predvolenou hodnotou; {} = všetko predvolené. Páry commanderov sú v Návody → Páry commanderov.'
        ),
    )

    class Meta:
        model = EvaluationSettings
        fields = ['data']

    def clean_data(self):
        data = self.cleaned_data.get('data')
        if data is None:
            return {}
        if not isinstance(data, dict):
            raise forms.ValidationError('Premenné musia byť JSON objekt { … }.')
        try:
            clean_settings(data)
        except ValueError:
            raise forms.ValidationError(
                'Len čistý JSON: objekty, zoznamy, čísla, texty do 200 znakov, najviac 6 úrovní.'
            ) from None
        if len(json.dumps(data)) > SETTINGS_MAX_BYTES:
            raise forms.ValidationError('Premenné sú príliš veľké (najviac 64 kB).')
        return data


@admin.register(EvaluationSettings)
class EvaluationSettingsAdmin(SuperuserOnlyAdmin, admin.ModelAdmin):
    """One row – the list opens it right away (created empty = the page's defaults)."""

    form = EvaluationSettingsForm
    fields = ['data', 'updated_at']
    readonly_fields = ['updated_at']

    def changelist_view(self, request, extra_context=None):
        if self.has_change_permission(request):
            return redirect('admin:accounts_evaluationsettings_change', EvaluationSettings.load().pk)
        return super().changelist_view(request, extra_context)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
