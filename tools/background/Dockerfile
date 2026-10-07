FROM python:3.13-slim
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends libcairo2 && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir -q cairosvg fonttools brotli
WORKDIR /work
ENTRYPOINT ["python", "tools/background/generate.py"]
