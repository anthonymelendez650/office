# Office

Small internal Streamlit tool for building catering estimates, saving them as JSON, and downloading a PDF from the same page.

## Stack

- Streamlit UI
- JSON file persistence (no SQLite)
- ReportLab PDF generation
- Nginx reverse proxy
- systemd service for Streamlit on Nucweb

## Features

- Client + event entry form
- Editable line items
- Auto-calculated subtotal, service charge, gratuity, tax, deposit, and balance due
- Sidebar business settings
- Save estimates as JSON files
- Reload saved estimates
- Download a PDF from the same page

## Project layout

```text
office/
  app/
    app.py
  data/
    estimates/
    counter.json
    settings.json
  deploy/
    nginx/
      office.premiumdynasty.com.conf
    systemd/
      office.service
  requirements.txt
  README.md
```

## Local run

```bash
cd /opt/webapps/office
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
streamlit run app/app.py --server.address 127.0.0.1 --server.port 8507
```

Then open:

```text
http://127.0.0.1:8507
```

## Deploy on Nucweb

Suggested destination:

```bash
sudo mkdir -p /opt/webapps
sudo unzip office.zip -d /opt/webapps
cd /opt/webapps/office
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## systemd service

Copy the included service file:

```bash
sudo cp deploy/systemd/office.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now office
sudo systemctl status office
```

## Nginx reverse proxy

Copy the included Nginx config:

```bash
sudo cp deploy/nginx/office.premiumdynasty.com.conf /etc/nginx/sites-available/office.premiumdynasty.com
sudo ln -s /etc/nginx/sites-available/office.premiumdynasty.com /etc/nginx/sites-enabled/office.premiumdynasty.com
sudo nginx -t
sudo systemctl reload nginx
```

## SSL

After DNS for `office.premiumdynasty.com` points to Nucweb, run Certbot:

```bash
sudo certbot --nginx -d office.premiumdynasty.com
```

## Data storage notes

- Business settings live in `data/settings.json`
- Estimate numbering lives in `data/counter.json`
- Each saved estimate is written to `data/estimates/`

This is intentionally simple and good for very light internal use.
If you later outgrow it, the next upgrade would be:

- PostgreSQL or SQLite
- user authentication
- better document templates
- emailed PDFs
