# Sonora

Un lecteur de musique de bureau (Electron) : bibliothèque locale, recherche dans un catalogue en ligne avec pochettes et photos d'artistes, playlists personnalisables, file d'attente, paroles synchronisées, thèmes et fonds animés.

> Projet personnel, open source (licence MIT). Il n'est affilié à aucun service de streaming cité dans ce document.

## Fonctionnalités

- **Bibliothèque locale** : ajoute des dossiers ou des fichiers (MP3, FLAC, WAV, OGG, M4A, OPUS, AAC).
- **Recherche en direct** : artistes, titres, albums et singles avec leurs vraies pochettes (données Deezer), pages d'artistes, historique des recherches récentes.
- **Lecture** : les titres du catalogue sont lus via la vidéo YouTube correspondante (API YouTube, clé requise).
- **Playlists personnalisables** : photo de couverture, nom, description, couleur, tri, recherche dans la playlist, mode compact, réordonner par glisser-déposer, ajout de titres depuis la page.
- **File d'attente** : « Lire ensuite », « Ajouter à la file », réordonner, retirer, aléatoire.
- **Paroles synchronisées** en plein écran (service LRCLIB), avec réglage du décalage.
- **Import de playlists publiques** depuis un lien Spotify ou Apple Music *(expérimental : dépend de pages web qui peuvent changer)*.
- **Apparence** : thèmes, couleur d'accent, fonds d'écran, 11 fonds animés dessinés en code (nuit étoilée, ciel et nuages, aurore, orage, etc.).

## Installation

Prérequis : [Node.js](https://nodejs.org) 18 ou plus. Testé sous Windows 11.

```bash
git clone https://github.com/<ton-compte>/sonora.git
cd sonora
npm install
```

### Clé YouTube (obligatoire pour lire les titres du catalogue)

1. Va sur la [console Google Cloud](https://console.cloud.google.com/), crée un projet et active **YouTube Data API v3**.
2. Crée une **clé d'API** (Identifiants → Créer des identifiants → Clé API) et restreins-la à l'API YouTube Data.
3. Donne-la à Sonora, au choix :
   - copie `sonora.config.example.json` en `sonora.config.json` et remplace la valeur de `youtubeApiKey` ;
   - ou définis la variable d'environnement `SONORA_YT_KEY`.

Ton fichier `sonora.config.json` est ignoré par Git : il ne sera jamais publié.

> Le quota gratuit est de 10 000 unités par jour. Chaque titre lancé depuis le catalogue coûte environ 101 unités, soit environ 100 lectures par jour.

### Lancer

```bash
npm start
```

### Facultatif : Jamendo
Dans **Apparence**, tu peux saisir une clé API Jamendo gratuite pour chercher de la musique libre.

## Structure

```
main.js            processus principal Electron (fenêtre, accès réseau, fichiers)
preload.js         pont sécurisé entre l'interface et le processus principal
renderer/          interface (HTML, CSS, JavaScript sans framework)
  app.js           état, lecteur, pages principales
  discover.js      recherche et catalogue
  playlists.js     page de playlist
  queue-panel.js   file d'attente
  player-full.js   vue plein écran et paroles
  animated-bg.js   fonds animés
```

## Services tiers

Sonora interroge des services publics et n'héberge ni ne distribue aucune musique ni aucune parole :

| Service | Usage |
|---|---|
| YouTube (IFrame API et Data API) | lecture des titres |
| Deezer (API publique) | recherche, pochettes, photos d'artistes |
| LRCLIB | paroles synchronisées |
| iTunes Search | pochettes complémentaires |
| Jamendo, Internet Archive | musique libre (facultatif) |

Respecte les conditions d'utilisation de chacun de ces services. L'usage de Sonora se fait sous ta seule responsabilité.

## Contribuer

Les contributions sont les bienvenues : lis [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE)
