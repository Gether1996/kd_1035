# Cuts the clowns of the Hall of Fame's mascots' corner out of their background (tools/hall/cutout.py).
# Build:  docker build -t kd1035-cutout tools/hall
# Run:    docker run --rm -v "$PWD:/work" kd1035-cutout
FROM python:3.11-slim
RUN pip install --no-cache-dir "rembg[cpu]==2.0.59" pillow==10.4.0
# the model is downloaded once into the mounted cache (tools/hall/.cache, not in git)
ENV U2NET_HOME=/work/tools/hall/.cache
WORKDIR /work
ENTRYPOINT ["python", "tools/hall/cutout.py"]
