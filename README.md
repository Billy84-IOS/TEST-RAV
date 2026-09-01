# HACKLAB — labo d'entraînement au pentest auto-hébergé

Un labo complet pour apprendre le test d'intrusion **sur son propre VPS**, piloté
depuis une page web (utilisable comme une app sur le téléphone).

- Des **cibles volontairement vulnérables** (OWASP Juice Shop, DVWA, WebGoat) que
  tu démarres/arrêtes d'un tap.
- Un **terminal web** : nmap, sqlmap, ffuf… directement dans le navigateur.
- Un **parcours d'apprentissage** guidé, avec progression sauvegardée.
- Un **aide-mémoire** des outils, commandes déjà cadrées sur le labo.

**Zéro dépendance à installer côté code** : le tableau de bord est en Node.js pur.

---

## ⚖️ À lire avant de commencer

Ce labo **n'attaque que lui-même**. Toutes les cibles tournent sur ton VPS, liées à
`127.0.0.1` : elles ne sont **pas** exposées sur Internet.

Utiliser ces outils contre un système que tu ne possèdes pas, **sans autorisation
écrite**, est un délit — en France, jusqu'à **3 ans de prison et 100 000 €**
(art. 323-1 du Code pénal). On s'entraîne uniquement sur : ce labo, les plateformes
dédiées (TryHackMe, Root-Me, Hack The Box), ou du bug bounty en respectant le périmètre.

> ⚠️ Ne lance jamais de scan ou d'attaque vers l'extérieur depuis ton VPS : la
> plupart des hébergeurs (OVH, Hetzner, DigitalOcean…) l'interdisent et coupent le
> serveur. Reste dans le labo.

---

## Installation sur le VPS (Ubuntu / Debian)

```bash
git clone -b claude/preview-appointment-masonry-site-l0xgny https://github.com/Billy84-IOS/TEST-RAV.git hacklab
cd hacklab
sudo bash install.sh
```

Le script installe Docker, les cibles, les outils, le terminal web et le tableau de
bord (en services qui redémarrent tout seuls). À la fin il affiche l'adresse et le
mot de passe.

Puis, depuis ton **iPhone** : ouvre `http://IP_DU_VPS:8000` dans Safari →
**Partager → « Sur l'écran d'accueil »**. Tu as l'icône et le plein écran, comme une app.

> Change le mot de passe dès la première connexion (onglet **Réglages**).

### Sécuriser l'accès (recommandé)

Le tableau de bord est protégé par mot de passe, mais pour le mettre en HTTPS derrière
ton domaine :

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
# proxy vers http://127.0.0.1:8000, puis :
sudo certbot --nginx -d labo.ton-domaine.fr
```

Active aussi le pare-feu (le script a préparé les règles) : `sudo ufw enable`.

---

## Ce que fait chaque onglet

| Onglet | Rôle |
|---|---|
| **Labo** | Démarrer / arrêter / ouvrir chaque cible vulnérable, voir son état |
| **Terminal** | Un vrai shell sur le VPS, dans le navigateur (via ttyd) |
| **Parcours** | 10 modules des fondations aux certifs, cases à cocher, progression sauvegardée serveur |
| **Outils** | Commandes prêtes à copier (nmap, ffuf, sqlmap, nuclei, hydra…), cadrées sur le labo |
| **Réglages** | Mot de passe, thème, gestion des services |

### Voir les cibles depuis le téléphone

- **DVWA** : bouton « Ouvrir » directement (passe par le tableau de bord authentifié).
- **Juice Shop / WebGoat** (applis modernes) : tunnel SSH depuis l'app **Termius** :
  ```bash
  ssh -L 3001:127.0.0.1:3001 user@TON_VPS
  ```
  puis `http://localhost:3001` dans Safari.

---

## Gérer le labo

```bash
docker compose ps                     # état des cibles
docker compose up -d                  # (re)démarrer les cibles
docker compose down                   # tout arrêter
sudo systemctl restart hacklab        # redémarrer le tableau de bord
sudo systemctl status hacklab-ttyd    # état du terminal web
journalctl -u hacklab -n 40           # logs du tableau de bord
```

Toutes tes données (progression, notes, mot de passe) sont dans `data/lab.json`.
Sauvegarde ce dossier :

```bash
tar czf sauvegarde-hacklab-$(date +%F).tar.gz data/
```

---

## Structure

```
install.sh           installe tout sur le VPS (Docker, outils, services)
docker-compose.yml   les cibles vulnérables (liées à 127.0.0.1)
server.js            tableau de bord : API, contrôle Docker, proxy, terminal
lab-data.js          cibles, parcours d'apprentissage, aide-mémoire des outils
public/              interface web (index.html, app.js, style.css)
data/                créé au 1er lancement — NON versionné (tes données)
```

## Réglages par variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `8000` | Port du tableau de bord |
| `TTYD_PORT` | `7681` | Port du terminal web (interne) |
| `DASHBOARD_PASSWORD` | généré | Mot de passe au premier lancement |

---

## Par où commencer ton apprentissage

1. Onglet **Parcours**, module 00 : lis les règles d'or.
2. Onglet **Labo** : démarre **DVWA**, connecte-toi (`admin` / `password`).
3. Onglet **Outils** : copie la commande **nmap**, colle-la dans le **Terminal**.
4. Attaque la première faille de DVWA (injection SQL, niveau « low ») en suivant
   PortSwigger Academy (lien dans le module 05).

Bon courage — et reste dans le labo. 🛡️
