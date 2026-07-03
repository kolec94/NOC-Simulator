FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    xvfb \
    ffmpeg \
    fonts-freefont-ttf \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

COPY capture.sh /usr/local/bin/capture.sh
RUN chmod +x /usr/local/bin/capture.sh

ENV SCREEN_URL=""
ENV STREAM_PATH="screen1"
ENV WIDTH=1920
ENV HEIGHT=1080
ENV FPS=30
ENV MEDIAMTX_HOST=mediamtx
ENV MEDIAMTX_RTMP_PORT=1935
ENV BITRATE=3000k

ENTRYPOINT ["dumb-init", "--"]
CMD ["/usr/local/bin/capture.sh"]
