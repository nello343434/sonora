# Contribuer à Sonora

Merci de t'intéresser au projet ! Quelques règles simples pour que ça reste agréable pour tout le monde.

## Avant de commencer
- Ouvre une *issue* pour proposer une nouveauté ou signaler un bug (joins une capture d'écran et le message d'erreur de la console : `Ctrl+Shift+I`).
- Pour un gros changement, discutes-en d'abord dans l'issue avant de coder.

## Lancer le projet
```bash
npm install
cp sonora.config.example.json sonora.config.json   # puis colle ta clé YouTube dedans
npm start
```

## Règles de code
- JavaScript simple, sans framework : l'interface est dans `renderer/`, le processus principal Electron dans `main.js`.
- Pas de dépendance ajoutée sans bonne raison.
- Vérifie ton code avec `node --check fichier.js` avant de proposer une *pull request*.
- **Ne commite jamais** de clé d'API, de fichier de config personnel, de musique, de paroles, ni d'image dont tu n'as pas les droits.

## Licence
En proposant une contribution, tu acceptes qu'elle soit publiée sous la licence MIT du projet.
