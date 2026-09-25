#!/usr/bin/env bash
# A loopback-only, fictional WordPress lab. Never use these credentials on a real site.
set -euo pipefail
cd "$(dirname "$0")/../.."
lab_name="${UNANYM_LAB_NAME:-drop-identity}"
case "$lab_name" in drop-identity|unanym-standalone|frrn-frontpage|unanym-frrn|unanym-second) ;; *) echo 'Unknown lab name' >&2; exit 1 ;; esac
wp_port="${UNANYM_WP_PORT:-4082}"
db_port="${UNANYM_DB_PORT:-43306}"
wp_host="${UNANYM_WP_HOST:-localhost}"
[[ "$wp_host" = localhost || "$wp_host" = 127.0.0.1 ]]
[[ "$wp_port" =~ ^[0-9]{4,5}$ && "$db_port" =~ ^[0-9]{4,5}$ ]]
lab_root="$PWD/data/${lab_name}-wordpress-lab"
if [ "$lab_name" = drop-identity ]; then lab_root="$PWD/data/wordpress-lab"; fi
mkdir -p "$lab_root"
case "${1:-start}" in
  stop)
    docker stop ${lab_name}-wp ${lab_name}-wp-db >/dev/null
    exit 0 ;;
  reset)
    for name in ${lab_name}-wp ${lab_name}-wp-db; do
      if docker inspect "$name" >/dev/null 2>&1; then
        test "$(docker inspect "$name" --format '{{index .Config.Labels "life.frrn.drop.rehearsal"}}')" = wordpress
        docker rm -fv "$name" >/dev/null
      fi
    done
    if docker volume inspect ${lab_name}-wp-lab >/dev/null 2>&1; then
      test "$(docker volume inspect ${lab_name}-wp-lab --format '{{index .Labels "life.frrn.drop.rehearsal"}}')" = wordpress
      docker volume rm ${lab_name}-wp-lab >/dev/null
    fi
    echo 'Removed only the named fictional WordPress containers and volume.'
    exit 0 ;;
  start) ;;
  *) echo 'Usage: scripts/wordpress/lab.sh start|stop|reset' >&2; exit 1 ;;
esac
if docker inspect ${lab_name}-wp >/dev/null 2>&1; then
  echo 'Lab already exists. Use stop/start with docker, or lab.sh reset for a clean install.'; exit 1
fi
curl -fsSL https://downloads.wordpress.org/plugin/daggerhart-openid-connect-generic.3.11.3.zip -o "$lab_root/generic.zip"
echo "81c009fe8f8f1504b329656d5a41176b5de09febfca4574393889c46387f8a97  $lab_root/generic.zip" | sha256sum --check --status
unzip -q -o "$lab_root/generic.zip" -d "$lab_root"
curl -fsSL https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar -o "$lab_root/wp-cli.phar"
echo "ce34ddd838f7351d6759068d09793f26755463b4a4610a5a5c0a97b68220d85c  $lab_root/wp-cli.phar" | sha256sum --check --status
docker volume create --label life.frrn.drop.rehearsal=wordpress ${lab_name}-wp-lab >/dev/null
docker run -d --name ${lab_name}-wp-db --label life.frrn.drop.rehearsal=wordpress --network host \
  -e MYSQL_ALLOW_EMPTY_PASSWORD=yes -e MYSQL_DATABASE=drop_identity_lab \
  mysql:8.4.11@sha256:85b9bf2e29cf836ecb8c2a15a935d4ba0c606631dff1dd79531a11983c638f2a \
  --bind-address=127.0.0.1 --port=${db_port} >/dev/null
docker run -d --name ${lab_name}-wp --label life.frrn.drop.rehearsal=wordpress --network host \
  -e WORDPRESS_DB_HOST=127.0.0.1:${db_port} -e WORDPRESS_DB_USER=root -e WORDPRESS_DB_PASSWORD= -e WORDPRESS_DB_NAME=drop_identity_lab \
  -e "WORDPRESS_CONFIG_EXTRA=define('WP_ENVIRONMENT_TYPE','local');" \
  -v ${lab_name}-wp-lab:/var/www/html -v "$PWD/integrations/wordpress/drop-identity:/var/www/html/wp-content/plugins/drop-identity:ro" \
  wordpress:7.1.2-php8.3-apache@sha256:bb209c8ab111746f22f578b870d866eb3f3da6028998a608202b706675450ecd \
  bash -c "sed -i 's/Listen 80/Listen 127.0.0.1:${wp_port}/' /etc/apache2/ports.conf; exec docker-entrypoint.sh apache2-foreground" >/dev/null
for attempt in $(seq 1 40); do
  if docker exec ${lab_name}-wp-db mysqladmin --port=${db_port} -h127.0.0.1 ping --silent >/dev/null 2>&1 && docker exec ${lab_name}-wp test -f /var/www/html/wp-config.php; then break; fi
  sleep 1
done
docker cp "$lab_root/wp-cli.phar" ${lab_name}-wp:/usr/local/bin/wp-cli.phar
docker cp "$lab_root/daggerhart-openid-connect-generic" ${lab_name}-wp:/var/www/html/wp-content/plugins/
docker exec ${lab_name}-wp php /usr/local/bin/wp-cli.phar --allow-root core install --url=http://${wp_host}:${wp_port} --title='Lakeside community' --admin_user=lab-admin --admin_password=local-demo-only-2026 --admin_email=admin@example.invalid --skip-email
docker exec ${lab_name}-wp php /usr/local/bin/wp-cli.phar --allow-root plugin activate daggerhart-openid-connect-generic drop-identity
echo "Fictional WordPress ready at http://${wp_host}:${wp_port}."
