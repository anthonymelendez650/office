#!/usr/bin/env bash
set -euo pipefail

project_root="${1:-/opt/webapps/sites/office}"
service_user="anthonym650"
service_group="anthonym650"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer as root." >&2
  exit 77
fi
if [[ ! -f "${project_root}/backend/data/office.sqlite3" ]]; then
  echo "Migrate and verify office.sqlite3 before installing services." >&2
  exit 66
fi

release_dist="${project_root}/.release-v5/dist"

install -d -m 0750 -o root -g "${service_group}" /etc/office
install -d -m 0755 -o root -g root /etc/nginx/snippets
install -d -m 0750 -o "${service_user}" -g "${service_group}" /opt/webapps/backups/office
install -d -m 0750 -o "${service_user}" -g "${service_group}" "${project_root}/.sites-runtime/home"

environment_file=/etc/office/office.env
if [[ ! -s "${environment_file}" ]]; then
  proxy_token="$(openssl rand -hex 32)"
  printf 'OFFICE_PROXY_TOKEN=%s\n' "${proxy_token}" >"${environment_file}"
  chown root:"${service_group}" "${environment_file}"
  chmod 0640 "${environment_file}"
else
  proxy_token="$(sed -n 's/^OFFICE_PROXY_TOKEN=//p' "${environment_file}" | head -n1)"
fi
if [[ -z "${proxy_token}" ]]; then
  echo "OFFICE_PROXY_TOKEN is missing from ${environment_file}." >&2
  exit 65
fi

snippet=/etc/nginx/snippets/office-proxy-auth.conf
cat >"${snippet}" <<EOF
proxy_set_header X-Office-Proxy-Token "${proxy_token}";
proxy_set_header X-Office-User \$remote_user;
proxy_set_header X-Office-Scopes "office.read office.internal.read office.pii.read office.catalog.write office.crm.write office.estimates.write office.archive office.admin";
EOF
chown root:root "${snippet}"
chmod 0640 "${snippet}"

install -m 0644 "${project_root}/deploy/nginx/office.premiumdynasty.com.conf" /etc/nginx/sites-available/office.premiumdynasty.com
ln -sfn /etc/nginx/sites-available/office.premiumdynasty.com /etc/nginx/sites-enabled/office.premiumdynasty.com
for unit in office.service office-backend.service office-mcp.service office-backup.service office-backup.timer office-healthcheck.service office-healthcheck.timer; do
  install -m 0644 "${project_root}/deploy/systemd/${unit}" "/etc/systemd/system/${unit}"
done

chown -R "${service_user}:${service_group}" "${project_root}/backend/data"
find "${project_root}/backend/data" -type d -exec chmod 0750 {} +
find "${project_root}/backend/data" -type f -exec chmod 0640 {} +

nginx -t
systemctl daemon-reload
systemctl enable office-backend.service office-mcp.service office.service office-backup.timer office-healthcheck.timer
systemctl reload nginx
systemctl restart office-backend.service
backend_ready=0
for _attempt in {1..20}; do
  if curl --fail --silent --max-time 2 http://127.0.0.1:8000/api/ready >/dev/null; then
    backend_ready=1
    break
  fi
  sleep 1
done
if [[ "${backend_ready}" -ne 1 ]]; then
  systemctl --no-pager --full status office-backend.service >&2 || true
  echo "Office backend did not become ready within 20 seconds." >&2
  exit 1
fi

systemctl restart office-mcp.service
mcp_ready=0
for _attempt in {1..20}; do
  if curl --silent --max-time 2 --output /dev/null http://127.0.0.1:8010/mcp; then
    mcp_ready=1
    break
  fi
  sleep 1
done
if [[ "${mcp_ready}" -ne 1 ]]; then
  systemctl --no-pager --full status office-mcp.service >&2 || true
  echo "Office MCP did not become ready within 20 seconds." >&2
  exit 1
fi

if [[ -d "${release_dist}" ]]; then
  systemctl stop office.service || true
  artifact_backup="${project_root}/dist.pre-sqlite-$(date -u +%Y%m%dT%H%M%SZ)"
  if [[ -d "${project_root}/dist" ]]; then
    mv "${project_root}/dist" "${artifact_backup}"
  fi
  mv "${release_dist}" "${project_root}/dist"
  chown -R "${service_user}:${service_group}" "${project_root}/dist"
fi

systemctl restart office.service
systemctl start office-backup.timer office-healthcheck.timer

systemctl --no-pager --full status office-backend.service office-mcp.service office.service
systemctl --no-pager list-timers office-backup.timer office-healthcheck.timer
