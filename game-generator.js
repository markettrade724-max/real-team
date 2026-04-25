// game-generator.js

// Function to generate a multilingual game
function generateGame(language) {
    const templates = {
        en: {
            title: 'Multilingual Game',
            instruction: 'Choose the right answer',
            gameOver: 'Game Over!'
        },
        es: {
            title: 'Juego Multilingüe',
            instruction: 'Elige la respuesta correcta',
            gameOver: '¡Juego Terminado!'
        },
        fr: {
            title: 'Jeu Multilingue',
            instruction: 'Choisissez la bonne réponse',
            gameOver: 'Jeu Terminé!'
        }
        // Add more languages as needed
    };

    const template = templates[language] || templates['en']; // Fallback to English

    return {
        title: template.title,
        instruction: template.instruction,
        gameOver: template.gameOver,
        // additional game properties
    };
}

// Export the generateGame function
module.exports = { generateGame };