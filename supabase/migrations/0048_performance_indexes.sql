-- FK indexes para queries de /equipo: evita seq scans en stage_activities,
-- service_stages, client_services y authorized_users.
CREATE INDEX IF NOT EXISTS idx_stage_activities_stage_id
  ON stage_activities(stage_id);

CREATE INDEX IF NOT EXISTS idx_service_stages_client_service_id
  ON service_stages(client_service_id);

CREATE INDEX IF NOT EXISTS idx_client_services_client_id
  ON client_services(client_id);

CREATE INDEX IF NOT EXISTS idx_authorized_users_email
  ON authorized_users(email);
