FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /workspace

RUN pip install --no-cache-dir uv

COPY apps/api/pyproject.toml apps/api/uv.lock /workspace/apps/api/
WORKDIR /workspace/apps/api
RUN uv sync --no-dev

COPY apps/api/app /workspace/apps/api/app
COPY apps/api/scripts /workspace/apps/api/scripts
COPY packages/templates /workspace/packages/templates

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
