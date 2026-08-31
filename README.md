# RAVI — boutique en ligne + espace admin

Boutique multi-rayons (animaux, jeux vidéo, déco intérieure, déco extérieure…) avec un
espace d'administration complet : commandes, statuts, clients, produits, rayons, réglages.

**Aucune dépendance à installer.** Juste Node.js 18 ou plus. Pas de `npm install`, pas de
base de données à configurer : les données vivent dans un simple fichier JSON.

---

## 1. Démarrer en 3 commandes

```bash
git clone https://github.com/Billy84-IOS/TEST-RAV.git
cd TEST-RAV
node server.js
```

La boutique tourne sur **http://localhost:3000** et l'admin sur **http://localhost:3000/admin**.

Au tout premier lancement, un mot de passe admin est généré et affiché dans la console.
Il est aussi écrit dans `data/mot-de-passe-admin.txt`. Pour le lire :

```bash
cat data/mot-de-passe-admin.txt
```

Pour choisir le mot de passe soi-même dès le départ :

```bash
ADMIN_PASSWORD="MonMotDePasseSolide" node server.js
```

> ⚠️ Changez le mot de passe depuis **Admin → Réglages** dès la première connexion, puis
> supprimez le fichier `data/mot-de-passe-admin.txt`.

---

## 2. Installation sur le VPS (à garder tournant en permanence)

### a. Installer Node.js (Ubuntu / Debian)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
```

### b. Récupérer le site

```bash
cd /opt
sudo git clone https://github.com/Billy84-IOS/TEST-RAV.git ravi
cd ravi
```

### c. Le faire tourner en service (redémarre tout seul)

```bash
sudo tee /etc/systemd/system/ravi.service > /dev/null <<'EOF'
[Unit]
Description=Boutique RAVI
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/ravi
ExecStart=/usr/bin/node /opt/ravi/server.js
Environment=PORT=3000
Restart=always
User=root

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ravi
sudo systemctl status ravi        # vérifier que ça tourne
journalctl -u ravi -n 30          # voir les logs (dont le mot de passe admin)
```

### d. Mettre le site derrière un nom de domaine + HTTPS

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

sudo tee /etc/nginx/sites-available/ravi > /dev/null <<'EOF'
server {
    listen 80;
    server_name VOTRE-DOMAINE.fr www.VOTRE-DOMAINE.fr;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/ravi /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d VOTRE-DOMAINE.fr -d www.VOTRE-DOMAINE.fr
```

Remplacez `VOTRE-DOMAINE.fr` par votre vrai domaine (à faire pointer sur l'IP du VPS avant).

### e. Mettre à jour le site plus tard

```bash
cd /opt/ravi && git pull && sudo systemctl restart ravi
```

Le dossier `data/` n'est jamais écrasé par une mise à jour : vos commandes et produits sont conservés.

---

## 3. Ce que fait l'espace admin

Accessible par le bouton **« ⚙️ Espace admin »** en bas de la page d'accueil, ou sur `/admin`.

| Onglet | Ce qu'on y fait |
|---|---|
| **Résumé** | Chiffre d'affaires, marge réelle (après coût fournisseur), panier moyen, commandes à traiter, graphique 14 jours, meilleures ventes |
| **Commandes** | Liste filtrable par statut, recherche, détail complet, changement de statut, numéro de suivi, référence de commande fournisseur, note interne, copie de l'adresse en un tap, export CSV |
| **Produits** | Créer / modifier / supprimer, prix de vente **et** prix d'achat (la marge se calcule toute seule), stock, photos (URL ou envoi depuis le téléphone), couleurs, tailles, lien fournisseur privé, mise en avant |
| **Clients** | Fiche par client, coordonnées cliquables, historique de commandes, total dépensé |
| **Rayons** | Créer vos catégories (animaux, jeux vidéo, déco…) avec leur icône |
| **Réglages** | Nom de la boutique, textes d'accueil, frais de port, seuil de livraison offerte, délai annoncé, mot de passe admin, export des données |

Les statuts de commande suivent le circuit du drop shipping :
`Nouvelle → Payée → Commandée chez le fournisseur → Expédiée → Livrée`
(+ `Annulée` et `Remboursée`).

---

## 4. Structure du projet

```
server.js           tout le serveur (API + fichiers statiques), zéro dépendance
public/
  index.html        boutique
  app.js            boutique (panier, commande, suivi)
  admin.html        espace admin
  admin.js          espace admin
  style.css         design partagé (clair + sombre automatique)
  img/harnais.jpg   photo du premier produit
data/               créé au premier lancement — NON versionné
  store.json        vos produits, commandes, clients, réglages
  uploads/          les photos envoyées depuis l'admin
```

### Sauvegarder vos données

Tout tient dans `data/`. Une sauvegarde = une copie de ce dossier :

```bash
tar czf sauvegarde-ravi-$(date +%F).tar.gz data/
```

---

## 5. Avant d'ouvrir la boutique pour de vrai

- [ ] Changer le mot de passe admin (Réglages)
- [ ] Remplacer le nom, les textes d'accueil et l'e-mail de contact
- [ ] Remplacer les produits d'exemple par vos vrais produits (avec vrais prix d'achat)
- [ ] Compléter mentions légales, CGV et informations d'entreprise (obligatoire en France)
- [ ] Brancher un vrai moyen de paiement — voir ci-dessous

### Le paiement

Le paiement en ligne par carte **n'est pas encore branché** : à la validation, la commande est
enregistrée avec le mode « à la livraison » ou « virement », et vous recontactez le client.
C'est volontaire — brancher Stripe demande un compte et des clés d'API.

Pour ajouter Stripe plus tard, le point d'entrée est la fonction `handleCreateOrder` dans
`server.js` : c'est là qu'il faut créer la session de paiement avant d'enregistrer la commande.

---

## 6. Réglages par variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `3000` | Port d'écoute |
| `HOST` | `0.0.0.0` | Interface d'écoute |
| `ADMIN_PASSWORD` | généré | Mot de passe admin au premier lancement |
