from rest_framework.decorators import api_view
from rest_framework.generics import ListAPIView
from rest_framework.response import Response

from .models import Alliance, SocialLink
from .serializers import AllianceSerializer, SocialLinkSerializer


@api_view(['GET'])
def health(request):
    return Response({'status': 'ok'})


class AllianceList(ListAPIView):
    serializer_class = AllianceSerializer
    queryset = Alliance.objects.filter(is_active=True).prefetch_related('officers')


class SocialLinkList(ListAPIView):
    serializer_class = SocialLinkSerializer
    queryset = SocialLink.objects.filter(is_active=True)
