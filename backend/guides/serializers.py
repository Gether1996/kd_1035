from rest_framework import serializers

from .meta.render import unit_icon
from .models import Guide


class GuideListSerializer(serializers.ModelSerializer):
    unit_icon = serializers.SerializerMethodField()
    excerpt_sk = serializers.SerializerMethodField()
    excerpt_cs = serializers.SerializerMethodField()

    class Meta:
        model = Guide
        fields = [
            'slug', 'category', 'unit', 'unit_icon', 'title_sk', 'title_cs', 'excerpt_sk', 'excerpt_cs', 'updated_at',
        ]  # fmt: skip

    def get_unit_icon(self, obj):
        return unit_icon(obj.unit)

    def get_excerpt_sk(self, obj):
        return obj.excerpt('sk')

    def get_excerpt_cs(self, obj):
        return obj.excerpt('cs')


class GuideDetailSerializer(GuideListSerializer):
    class Meta(GuideListSerializer.Meta):
        fields = GuideListSerializer.Meta.fields + ['html_sk', 'html_cs']
