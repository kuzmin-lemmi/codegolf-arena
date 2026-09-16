# Автоматический ежедневный бэкап

Установка (один раз, на сервере):

```bash
sudo cp /home/deploy/codegolf-arena/scripts/systemd/codegolf-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now codegolf-backup.timer
```

Проверка:

```bash
systemctl list-timers codegolf-backup.timer   # когда следующий запуск
sudo systemctl start codegolf-backup.service  # прогнать прямо сейчас
journalctl -u codegolf-backup.service -n 30   # что было в последний раз
```

Если systemd по каким-то причинам не подходит — то же самое через cron
(`crontab -e` от пользователя deploy):

```
30 3 * * * /usr/bin/env bash /home/deploy/codegolf-arena/scripts/backup-db.sh >> /home/deploy/backups/backup.log 2>&1
```
