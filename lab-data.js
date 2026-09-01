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
    id: 'dvwa',
    container: 'lab-dvwa',
    name: 'DVWA',
    port: 3002,
    difficulty: 'Débutant',
    tags: ['Web', 'PHP'],
    blurb:
      "Damn Vulnerable Web Application. Chaque faille (injection SQL, XSS, upload…) est isolée avec 4 niveaux de sécurité. Idéal pour comprendre une faille à la fois.",
    creds: 'admin / password — puis « Create / Reset Database »',
    proxyOk: true,
    tip: 'Sert des pages classiques : marche directement dans le navigateur via le bouton Ouvrir.',
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
