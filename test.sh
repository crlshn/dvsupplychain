# Ver el historial de reinicios del 
# contenedor
docker inspect dvsupplychain-cloudflared-1 
--format '{{.RestartCount}} restarts, 
created {{.Created}}'
# Ver si el sistema se reinició (buscar el 
# uptime del host)
uptime
# Ver si Docker se reinició
systemctl status docker --no-pager | head 
-20
# Ver los logs del journalctl cuando el 
# contenedor se detuvo (21:57 UTC del 14 
# oct)
journalctl --since "2026-10-14 21:55" 
--until "2026-10-14 22:00" --no-pager | 
grep -i 
"docker\|cloudflared\|shutdown\|reboot"
# Ver si hay algo que detenga Docker 
# periódicamente
systemctl list-timers --no-pager | grep -i 
docker
crontab -l 2>/dev/null
