-- Migración 0027: agregar columna `validated` a materiality_topics.
--
-- Antes: ClientTabs mostraba "Todas validadas" cuando había 20 topics, sin
-- que el consultor hubiera revisado realmente. La validación era ficticia
-- (materialityValidated = materialityCount).
--
-- Después: cada topic tiene flag `validated` boolean. La UI cuenta solo los
-- topics con validated=true. El consultor debe explícitamente confirmar.

alter table materiality_topics
  add column if not exists validated boolean not null default false;

-- Topics existentes seedeados quedan en validated=false. El consultor los
-- aprueba uno por uno o vía bulk action en la matriz.
comment on column materiality_topics.validated is
  'true cuando el consultor confirmó que el posicionamiento del topic es correcto. false por default.';
