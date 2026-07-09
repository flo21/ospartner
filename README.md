# Partner OS

Partner OS est un MVP SaaS interne pour 4000m destiné à piloter les partenaires, contrats, produits, prix, marges, commandes, factures et alertes.

## Clone & Run

Aucune installation PostgreSQL n'est nécessaire. La base SQLite locale est créée automatiquement dans:

```text
server/data/partner-os.sqlite
```

L'application fonctionne directement après:

```bash
npm install
npm run dev
```

Le frontend est disponible sur `http://localhost:5173`.
L'API est disponible sur `http://localhost:4000`.

Au démarrage du backend:

- le fichier SQLite est créé s'il n'existe pas
- les migrations SQL sont appliquées automatiquement
- les données de démonstration sont créées automatiquement si la base est vide

## Comptes de démonstration

- Admin: `admin@4000m.com` / `Admin4000m!`
- Partenaire Alpes Tandem: `partner-alpes-tandem@4000m.com` / `Partner4000m!`
- Partenaire Azur Parachutisme: `partner-azur-parachutisme@4000m.com` / `Partner4000m!`
- Partenaire Ouest Chute Libre: `partner-ouest-chute-libre@4000m.com` / `Partner4000m!`

## Stack

- Backend: Node.js, Express, SQLite, JWT, bcrypt
- Frontend: React, Vite
- Base de données: fichier local SQLite, migrations SQL automatiques
- Sécurité: hash des mots de passe, JWT, rôles `admin` et `partner`, requêtes SQL paramétrées, validation d'inputs

## Scripts

```bash
npm run dev      # lance backend et frontend
npm run build    # build production du frontend
npm run migrate  # applique les migrations manuellement si besoin
npm run seed     # réinitialise les données de démo
npm run db:inspect          # liste les tables SQLite et leurs compteurs
npm run db:inspect partners # affiche les lignes d'une table
```

## Configuration optionnelle

Aucun fichier `.env` n'est requis pour développer localement.

Un `.env` peut être ajouté pour personnaliser certains paramètres:

```bash
cp .env.example .env
```

Variables disponibles:

- `PORT`: port API, par défaut `4000`
- `JWT_SECRET`: secret JWT, valeur de développement fournie par défaut
- `JWT_EXPIRES_IN`: durée de validité JWT, par défaut `8h`
- `CORS_ORIGIN`: origine frontend, par défaut `http://localhost:5173`
- `DATABASE_PATH`: chemin SQLite, par défaut `server/data/partner-os.sqlite`
- `VITE_API_URL`: URL API consommée par le frontend, par défaut `http://localhost:4000/api`

## Déploiement Linux

Domaine cible: `ospartner.millsrocket.com`.

Architecture production:

- Nginx sert `client/dist`
- Express expose uniquement l'API sur `127.0.0.1:4000`
- SQLite persiste dans `server/data/partner-os.sqlite`
- PM2 maintient le process `partner-os`
- Certbot gère HTTPS Let's Encrypt

### Variables production

Créer le fichier local non versionné:

```bash
cp .env.production.example .env.production
```

Vérifier notamment:

```bash
NODE_ENV=production
PORT=4000
JWT_SECRET=une-valeur-longue-et-secrete
CORS_ORIGIN=https://ospartner.millsrocket.com
DATABASE_PATH=server/data/partner-os.sqlite
```

Le frontend production utilise:

```bash
client/.env.production
VITE_API_URL=https://ospartner.millsrocket.com/api
```

### Build et PM2

```bash
npm install
npm run build
NODE_ENV=production npm run migrate
pm2 start ecosystem.config.js
pm2 save
```

Déploiements suivants:

```bash
./deploy.sh
```

### Nginx

Exemple de vhost:

```nginx
server {
    server_name ospartner.millsrocket.com;

    root /var/www/partner-os/client/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:4000/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Activer HTTPS:

```bash
sudo certbot --nginx -d ospartner.millsrocket.com
sudo systemctl reload nginx
```

### Vérifications

```bash
pm2 status
pm2 logs partner-os
curl https://ospartner.millsrocket.com/health
curl https://ospartner.millsrocket.com/api/auth/me
```

## Modules inclus

- Authentification admin/partenaire par JWT
- CRUD partenaires côté admin
- Fiche partenaire avec analyse automatique enregistrée
- Contrats avec upload PDF côté backend
- Produits partenaires avec marges calculées en base
- URLs surveillées et historique `price_checks`
- Service de contrôle prix persisté: `POST /api/monitoring/price-checks/run`
- Dashboard admin: CA, marge, commandes, partenaires actifs, tops, alertes, factures, mensuel
- Commandes avec filtres par statut, période, produit, partenaire et source
- Facturation partenaire: commandes consommées non facturées, création et soumission
- Validation/rejet des factures côté admin
- Alertes avec action "traiter"
- Espace partenaire limité sans exposition des marges globales 4000m

## Structure

```text
server/
  src/
    app.js
    server.js
    config/
    data/
    db/
    middleware/
    migrations/
    routes/
    services/
    utils/
client/
  src/
    main.jsx
    styles.css
```

## Notes MVP

Le scraping réel n'est pas implémenté. Le service `priceMonitorService.js` simule un contrôle quotidien et persiste les résultats dans SQLite: `price_checks`, `monitored_urls` et `alerts`.

L'intégration OpenAI est préparée via `server/src/services/aiAnalysisService.js`; les analyses générées sont enregistrées dans `ai_partner_reports`.
