# Postgres verification commands (run now)

```bash
# 1. Did the auth failures STOP? Show every FATAL line since 03:00 UTC:
docker logs goldex-postgres --since "2026-08-03 03:00:00" 2>&1 | grep -E "FATAL|LOG|DETAIL" | head -60

# 2. What does pg_hba.conf actually contain (rule ABOVE line 100 matters - first match wins):
docker exec goldex-postgres sh -c 'wc -l /var/lib/postgresql/data/pg_hba.conf && cat /var/lib/postgresql/data/pg_hba.conf | tail -25'

# 3. Test auth from INSIDE the docker network (same path the apps use), not 127.0.0.1:
docker exec goldex-postgres env PGPASSWORD=postgres psql -U postgres -h postgres -d GOLDEX-DB -c "SELECT 1"

# 4. Real volume name + creation date (is data being wiped per deploy?):
docker volume ls | grep -i postgres
docker volume inspect goldex-github_postgres_data 2>/dev/null | grep -E "CreatedAt|Name"
docker exec goldex-postgres ls -la /var/lib/postgresql/data | grep -E "PG_VERSION|postgresql.conf"

# 5. Current failure count in the last hour (should be 0):
docker logs goldex-postgres --since 1h 2>&1 | grep -c "FATAL"
```
