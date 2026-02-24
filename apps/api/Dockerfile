FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /workspace

RUN pip install --no-cache-dir uv

# Copy build context into a stable location so this Dockerfile can work whether Render
# builds from `apps/api` (legacy) or repository root (monorepo).
COPY . /workspace/source

RUN mkdir -p /workspace/apps/api /workspace/packages /workspace/apps-api-root

RUN if [ -d /workspace/source/apps/api ]; then \
        cp /workspace/source/apps/api/pyproject.toml /workspace/apps/api/; \
        cp /workspace/source/apps/api/uv.lock /workspace/apps/api/; \
        cp -R /workspace/source/apps/api/app /workspace/apps/api/; \
        cp -R /workspace/source/apps/api/scripts /workspace/apps/api/; \
        if [ -d /workspace/source/packages/templates ]; then \
            cp -R /workspace/source/packages/templates /workspace/packages/; \
        fi; \
        if [ -d /workspace/source/apps/api/templates ]; then \
            cp -R /workspace/source/apps/api/templates /workspace/apps/api/; \
        fi; \
    else \
        cp /workspace/source/pyproject.toml /workspace/apps/api/; \
        cp /workspace/source/uv.lock /workspace/apps/api/; \
        cp -R /workspace/source/app /workspace/apps-api-root/; \
        cp -R /workspace/source/scripts /workspace/apps-api-root/; \
        cp -R /workspace/apps-api-root/app /workspace/apps/api/; \
        cp -R /workspace/apps-api-root/scripts /workspace/apps/api/; \
        if [ -d /workspace/source/packages/templates ]; then \
            cp -R /workspace/source/packages/templates /workspace/packages/; \
        fi; \
        if [ -d /workspace/source/templates ]; then \
            cp -R /workspace/source/templates /workspace/apps/api/; \
        fi; \
    fi

WORKDIR /workspace/apps/api
# Keep default image lean for faster Render deploys; install medgemma extra only when needed.
ARG INSTALL_MEDGEMMA=false
RUN if [ "$INSTALL_MEDGEMMA" = "true" ]; then \
        uv sync --no-dev --extra medgemma; \
    else \
        uv sync --no-dev; \
    fi

RUN rm -rf /workspace/source /workspace/apps-api-root

EXPOSE 8000

CMD ["sh", "-c", "exec /workspace/apps/api/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
