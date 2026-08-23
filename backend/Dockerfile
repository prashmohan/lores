FROM python:3.12-slim

WORKDIR /app

# Install curl for health check and gosu for step-down from root
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gosu \
    && rm -rf /var/lib/apt/lists/*

# Create unprivileged system user and group for runtime isolation
RUN groupadd -g 10001 lores && \
    useradd -u 10001 -g lores -s /bin/sh -M lores

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code and entrypoint
COPY app/ ./app/
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    DATABASE_URL=sqlite:///./data/lores.db

# Persistent volume directory for SQLite data with non-root ownership
RUN mkdir -p /app/data && chown -R lores:lores /app

EXPOSE 8000

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
