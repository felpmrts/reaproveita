-- História ST13 / SCRUM-27 / SCRUM-83 / SCRUM-84 - Configuração do pg_cron para expiração automática a cada minuto (RF13, RN13)

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  existing_job_id BIGINT;
BEGIN
  SELECT jobid
    INTO existing_job_id
    FROM cron.job
   WHERE jobname = 'expire_overdue_food_batches_every_minute';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'expire_overdue_food_batches_every_minute',
    '* * * * *',
    'SELECT public.expire_overdue_food_batches();'
  );
END;
$$;
