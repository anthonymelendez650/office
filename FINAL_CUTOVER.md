# Final Office Deployment Cutover

The application and live data have already been cut over in place to the tested frontend release
and `backend/data/office.sqlite3`. Do not use the retired `office.next` directory procedure.

The remaining root-owned installation step applies strict API authentication, the trusted Nginx
proxy headers, the bearer-only MCP API route, hardened systemd units, and backup/health timers:

```bash
sudo /opt/webapps/sites/office/deploy/install-root.sh /opt/webapps/sites/office
```

Verify after the installer completes:

```bash
systemctl --no-pager --full status office-backend.service office.service
systemctl --no-pager list-timers office-backup.timer office-healthcheck.timer
curl --fail http://127.0.0.1:8000/api/ready
```

The pre-migration rollback copy is
`/opt/webapps/sites/office.manual-backup-20260807-071135`. Follow
`MIGRATION_RUNBOOK.md` for database verification and rollback requirements.
