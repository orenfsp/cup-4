FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/apps/api:/app/packages/contracts DJANGO_SETTINGS_MODULE=config.settings
WORKDIR /app
COPY apps/api/requirements.lock /tmp/requirements.lock
RUN pip install --no-cache-dir --require-hashes -r /tmp/requirements.lock
RUN useradd --uid 10001 --create-home otklik
COPY apps/api /app/apps/api
COPY packages/contracts /app/packages/contracts
COPY pyproject.toml /app/pyproject.toml

FROM base AS runtime
USER otklik
CMD ["sh", "-c", "python apps/api/manage.py migrate --noinput && exec gunicorn config.asgi:application --worker-class asgi --asgi-lifespan off --bind 0.0.0.0:8000 --workers 1 --worker-connections 256 --timeout 30 --error-logfile /dev/null"]
