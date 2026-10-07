from rest_framework import serializers

from .models import Guide


class GuideListSerializer(serializers.ModelSerializer):
    excerpt_sk = serializers.SerializerMethodField()
    excerpt_cs = serializers.SerializerMethodField()

    class Meta:
        model = Guide
        fields = ['slug', 'category', 'title_sk', 'title_cs', 'excerpt_sk', 'excerpt_cs', 'updated_at']

    def get_excerpt_sk(self, obj):
        return obj.excerpt('sk')

    def get_excerpt_cs(self, obj):
        return obj.excerpt('cs')


class GuideDetailSerializer(GuideListSerializer):
    class Meta(GuideListSerializer.Meta):
        fields = GuideListSerializer.Meta.fields + ['html_sk', 'html_cs']
