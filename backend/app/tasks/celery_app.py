"""
Celery application configuration.
"""

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "sistema_contable",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Mexico_City",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_always_eager=True,
    task_eager_propagates=True,
)

# Auto-discover tasks in the app.tasks package
celery_app.autodiscover_tasks(["app.tasks"])
