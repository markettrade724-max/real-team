/**
 * game-generator.js — يولّد الألعاب بـ 6 لغات من القوالب
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── خريطة القوالب ─────────────────────────────────────────────
const TEMPLATE_MAP = {
  // سباقات السرعة ← القالب الرئيسي الجديد
  racing:   'racing-game.html',
  race:     'racing-game.html',
  speed:    'racing-game.html',
  car:      'racing-game.html',
  drift:    'racing-game.html',
  moto:     'racing-game.html',
  // رياضات متنوعة
  sport:      'sports-game.html',
  football:   'sports-game.html',
  basketball: 'sports-game.html',
  tennis:     'sports-game.html',
  soccer:     'sports-game.html',
  // أكشن وإطلاق نار
  arcade:   'phaser-game.html',
  shooter:  'phaser-game.html',
  action:   'phaser-game.html',
  space:    'phaser-game.html',
  // مغامرات وRPG
  rpg:       'adventure-rpg.html',
  adventure: 'adventure-rpg.html',
  story:     'adventure-rpg.html',
  quest:     'adventure-rpg.html',
  // تطبيقات وأدوات
  tool:      'tool-app.html',
  app:       'tool-app.html',
  timer:     'tool-app.html',
  focus:     'tool-app.html',
};

// ── الترجمات ──────────────────────────────────────────────────
const LABELS = {
  ar:{ dir:'rtl',
    // عام
    START_LBL:'ابدأ اللعبة', SHOP_LBL:'المتجر', BEST_LBL:'أفضل نتيجة',
    SCORE_LBL:'النقاط', LEVEL_LBL:'المستوى', LIVES_LBL:'الأرواح',
    GAMEOVER_LBL:'انتهت اللعبة', RETRY_LBL:'حاول مجدداً', HOME_LBL:'الرئيسية',
    NEW_BEST_LBL:'رقم قياسي جديد', BACK_LBL:'رجوع',
    TIME_LBL:'وقت', RESTART_LBL:'لعبة جديدة', WIN_TITLE:'أحسنت!',
    PLAY_AGAIN_LBL:'مرة أخرى', AD_LABEL:'الإعلانات تدعم الفريق',
    AD_REMOVE_LABEL:'إزالة $1.99',
    // سباقات
    LAP_LBL:'لفّة', LAPS_LBL:'اللفّات', SPEED_LBL:'السرعة',
    POSITION_LBL:'المركز', BEST_LAP_LBL:'أفضل لفّة', FINISH_LBL:'النهاية',
    RACE_START_LBL:'انطلق!', RACE_OVER_LBL:'انتهى السباق',
    COUNTDOWN_LBL:'استعد', BOOST_LBL:'تسريع', NITRO_LBL:'نيترو',
    TRACK_LBL:'المضمار', OPPONENT_LBL:'المنافس', QUALIFY_LBL:'التأهل',
    RACE_WIN_LBL:'فزت بالسباق!', RACE_LOSE_LBL:'حاول في المرة القادمة',
    BEST_TIME_LBL:'أفضل وقت', KMH_LBL:'كم/س',
    // رياضات
    TEAM_LBL:'الفريق', MATCH_LBL:'المباراة', GOAL_LBL:'هدف!',
    HALF_LBL:'الشوط', PLAYER_LBL:'اللاعب', STADIUM_LBL:'الملعب',
    CHAMPIONSHIP_LBL:'البطولة', SCORE_HOME_LBL:'المضيف', SCORE_AWAY_LBL:'الضيف',
    FOUL_LBL:'خطأ', PENALTY_LBL:'ركلة جزاء', MATCH_OVER_LBL:'نهاية المباراة',
    WIN_MATCH_LBL:'فريقك فاز!', DRAW_LBL:'تعادل', LOSE_MATCH_LBL:'خسرت',
    // مغامرات وRPG
    HERO_LBL:'البطل', NARRATOR_LBL:'الراوي', ELDER_LBL:'الشيخ',
    MERCHANT_LBL:'التاجر',
    ATTACK_LBL:'هجوم', MAGIC_LBL:'سحر', DEFEND_LBL:'دفاع', ITEM_LBL:'عنصر',
    COMBAT_START_LBL:'المعركة بدأت!', DEFEND_MSG_LBL:'أنت في وضع الدفاع',
    NO_MP_LBL:'نقاط السحر ناضبة', NO_ITEM_LBL:'لا عناصر متبقية',
    NO_GOLD_LBL:'الذهب غير كافٍ',
    ENEMY_WOLF:'الذئب المتوحش', ENEMY_BOSS:'ملك الظلام',
    CHOICE_ENTER:'ادخل القرية', CHOICE_CAMP:'أقم معسكراً',
    CHOICE_REST:'استرح (استعادة 30 HP)', CHOICE_ACCEPT:'اقبل المهمة',
    CHOICE_SHOP:'تفضل للمتجر', CHOICE_LEAVE:'غادر',
    CHOICE_BUY_POTION:'اشتر جرعة (15 ذهب)', CHOICE_FIGHT:'قاتل',
    CHOICE_SNEAK:'تسلل خفية', CHOICE_BACK:'عد للخلف',
    CHOICE_EXPLORE:'استكشف الزنزانة', CHOICE_BOSS:'واجه الملك',
    CHOICE_CONTINUE:'تابع', CHOICE_RESTART:'ابدأ من جديد',
    SCENE_INTRO:'في ليلة مظلمة، تجد نفسك على أبواب مملكة مهجورة.',
    SCENE_VILLAGE:'أيها البطل، مملكتنا تتألم. هل ستساعدنا؟',
    SCENE_CAMP:'النار تدفئك. هذا المكان آمن للاستراحة.',
    SCENE_SHOP:'مرحباً بالبطل! لدي جرعات شفاء وأسلحة نادرة.',
    SCENE_FOREST:'الغابة مليئة بالأخطار. تسمع أصوات ذئاب في الظلام.',
    SCENE_DUNGEON:'وصلت إلى الزنزانة القديمة. الهواء ثقيل.',
    SCENE_TREASURE:'وجدت حجرة مليئة بالذهب والجواهر!',
    SCENE_VICTORY:'هزمت ملك الظلام وأنقذت المملكة!',
    SCENE_DEFEAT:'سقطت في المعركة... قم وحاول مجدداً!',
    // تطبيقات
    FOCUS_LBL:'تركيز', SHORT_LBL:'استراحة', LONG_LBL:'استراحة طويلة',
    START_LBL2:'ابدأ', PAUSE_LBL:'توقف', SESSIONS_LBL:'جلسات',
    MINUTES_LBL:'دقيقة', STREAK_LBL:'متواصل', DONE_LBL:'انتهت الجلسة!',
  },
  en:{ dir:'ltr',
    START_LBL:'Play Now', SHOP_LBL:'Shop', BEST_LBL:'Best Score',
    SCORE_LBL:'Score', LEVEL_LBL:'Level', LIVES_LBL:'Lives',
    GAMEOVER_LBL:'Game Over', RETRY_LBL:'Try Again', HOME_LBL:'Home',
    NEW_BEST_LBL:'New Record', BACK_LBL:'Back',
    TIME_LBL:'Time', RESTART_LBL:'New Game', WIN_TITLE:'You Win!',
    PLAY_AGAIN_LBL:'Play Again', AD_LABEL:'Ads support our team',
    AD_REMOVE_LABEL:'Remove $1.99',
    // racing
    LAP_LBL:'Lap', LAPS_LBL:'Laps', SPEED_LBL:'Speed',
    POSITION_LBL:'Position', BEST_LAP_LBL:'Best Lap', FINISH_LBL:'Finish',
    RACE_START_LBL:'Go!', RACE_OVER_LBL:'Race Over',
    COUNTDOWN_LBL:'Get Ready', BOOST_LBL:'Boost', NITRO_LBL:'Nitro',
    TRACK_LBL:'Track', OPPONENT_LBL:'Opponent', QUALIFY_LBL:'Qualify',
    RACE_WIN_LBL:'You won the race!', RACE_LOSE_LBL:'Better luck next time',
    BEST_TIME_LBL:'Best Time', KMH_LBL:'km/h',
    // sports
    TEAM_LBL:'Team', MATCH_LBL:'Match', GOAL_LBL:'Goal!',
    HALF_LBL:'Half', PLAYER_LBL:'Player', STADIUM_LBL:'Stadium',
    CHAMPIONSHIP_LBL:'Championship', SCORE_HOME_LBL:'Home', SCORE_AWAY_LBL:'Away',
    FOUL_LBL:'Foul', PENALTY_LBL:'Penalty', MATCH_OVER_LBL:'Full Time',
    WIN_MATCH_LBL:'Your team won!', DRAW_LBL:'Draw', LOSE_MATCH_LBL:'You lost',
    // rpg
    HERO_LBL:'Hero', NARRATOR_LBL:'Narrator', ELDER_LBL:'Elder',
    MERCHANT_LBL:'Merchant',
    ATTACK_LBL:'Attack', MAGIC_LBL:'Magic', DEFEND_LBL:'Defend', ITEM_LBL:'Item',
    COMBAT_START_LBL:'Battle begins!', DEFEND_MSG_LBL:'You are defending',
    NO_MP_LBL:'Not enough MP', NO_ITEM_LBL:'No items left',
    NO_GOLD_LBL:'Not enough gold',
    ENEMY_WOLF:'Wild Wolf', ENEMY_BOSS:'Dark King',
    CHOICE_ENTER:'Enter the village', CHOICE_CAMP:'Set up camp',
    CHOICE_REST:'Rest (restore 30 HP)', CHOICE_ACCEPT:'Accept the quest',
    CHOICE_SHOP:'Visit the shop', CHOICE_LEAVE:'Leave',
    CHOICE_BUY_POTION:'Buy potion (15 gold)', CHOICE_FIGHT:'Fight',
    CHOICE_SNEAK:'Sneak past', CHOICE_BACK:'Go back',
    CHOICE_EXPLORE:'Explore the dungeon', CHOICE_BOSS:'Face the king',
    CHOICE_CONTINUE:'Continue', CHOICE_RESTART:'Start over',
    SCENE_INTRO:'On a dark night, you find yourself at the gates of an abandoned kingdom.',
    SCENE_VILLAGE:'Hero, our kingdom suffers. Will you help us?',
    SCENE_CAMP:'The fire warms you. This place is safe for rest.',
    SCENE_SHOP:'Welcome hero! I have healing potions and rare weapons.',
    SCENE_FOREST:'The dense forest is full of dangers. You hear wolves howling.',
    SCENE_DUNGEON:'You have reached the ancient dungeon. The air is heavy.',
    SCENE_TREASURE:'You found a chamber full of gold and jewels!',
    SCENE_VICTORY:'You defeated the Dark King and saved the kingdom!',
    SCENE_DEFEAT:'You fell in battle... Rise and try again!',
    // tool
    FOCUS_LBL:'Focus', SHORT_LBL:'Short Break', LONG_LBL:'Long Break',
    START_LBL2:'Start', PAUSE_LBL:'Pause', SESSIONS_LBL:'Sessions',
    MINUTES_LBL:'Minutes', STREAK_LBL:'Streak', DONE_LBL:'Session done!',
  },
  fr:{ dir:'ltr',
    START_LBL:'Jouer', SHOP_LBL:'Boutique', BEST_LBL:'Meilleur score',
    SCORE_LBL:'Score', LEVEL_LBL:'Niveau', LIVES_LBL:'Vies',
    GAMEOVER_LBL:'Game Over', RETRY_LBL:'Réessayer', HOME_LBL:'Accueil',
    NEW_BEST_LBL:'Nouveau record', BACK_LBL:'Retour',
    TIME_LBL:'Temps', RESTART_LBL:'Nouveau jeu', WIN_TITLE:'Bravo!',
    PLAY_AGAIN_LBL:'Rejouer', AD_LABEL:'Les pubs soutiennent l\'équipe',
    AD_REMOVE_LABEL:'Supprimer 1,99$',
    LAP_LBL:'Tour', LAPS_LBL:'Tours', SPEED_LBL:'Vitesse',
    POSITION_LBL:'Position', BEST_LAP_LBL:'Meilleur tour', FINISH_LBL:'Arrivée',
    RACE_START_LBL:'Partez!', RACE_OVER_LBL:'Course terminée',
    COUNTDOWN_LBL:'Prêt', BOOST_LBL:'Boost', NITRO_LBL:'Nitro',
    TRACK_LBL:'Circuit', OPPONENT_LBL:'Adversaire', QUALIFY_LBL:'Qualification',
    RACE_WIN_LBL:'Vous avez gagné la course!', RACE_LOSE_LBL:'Meilleure chance la prochaine fois',
    BEST_TIME_LBL:'Meilleur temps', KMH_LBL:'km/h',
    TEAM_LBL:'Équipe', MATCH_LBL:'Match', GOAL_LBL:'But!',
    HALF_LBL:'Mi-temps', PLAYER_LBL:'Joueur', STADIUM_LBL:'Stade',
    CHAMPIONSHIP_LBL:'Championnat', SCORE_HOME_LBL:'Domicile', SCORE_AWAY_LBL:'Extérieur',
    FOUL_LBL:'Faute', PENALTY_LBL:'Penalty', MATCH_OVER_LBL:'Fin du match',
    WIN_MATCH_LBL:'Votre équipe a gagné!', DRAW_LBL:'Match nul', LOSE_MATCH_LBL:'Vous avez perdu',
    HERO_LBL:'Héros', NARRATOR_LBL:'Narrateur', ELDER_LBL:'Ancien', MERCHANT_LBL:'Marchand',
    ATTACK_LBL:'Attaque', MAGIC_LBL:'Magie', DEFEND_LBL:'Défense', ITEM_LBL:'Objet',
    COMBAT_START_LBL:'Le combat commence!', DEFEND_MSG_LBL:'Vous défendez',
    NO_MP_LBL:'Pas assez de MP', NO_ITEM_LBL:'Plus d\'objets', NO_GOLD_LBL:'Pas assez d\'or',
    ENEMY_WOLF:'Loup Sauvage', ENEMY_BOSS:'Roi des Ténèbres',
    CHOICE_ENTER:'Entrer au village', CHOICE_CAMP:'Établir un camp',
    CHOICE_REST:'Se reposer (+30 HP)', CHOICE_ACCEPT:'Accepter la quête',
    CHOICE_SHOP:'Visiter la boutique', CHOICE_LEAVE:'Partir',
    CHOICE_BUY_POTION:'Acheter potion (15 or)', CHOICE_FIGHT:'Combattre',
    CHOICE_SNEAK:'Passer discrètement', CHOICE_BACK:'Retour',
    CHOICE_EXPLORE:'Explorer le donjon', CHOICE_BOSS:'Affronter le roi',
    CHOICE_CONTINUE:'Continuer', CHOICE_RESTART:'Recommencer',
    SCENE_INTRO:'Par une nuit sombre, vous vous trouvez aux portes d\'un royaume abandonné.',
    SCENE_VILLAGE:'Héros, notre royaume souffre. Des monstres nous attaquent chaque nuit.',
    SCENE_CAMP:'Le feu vous réchauffe. Cet endroit est sûr pour se reposer.',
    SCENE_SHOP:'Bienvenue héros! J\'ai des potions et des armes rares.',
    SCENE_FOREST:'La forêt dense est pleine de dangers.',
    SCENE_DUNGEON:'Vous avez atteint l\'ancien donjon. L\'air est lourd.',
    SCENE_TREASURE:'Vous avez trouvé une chambre pleine d\'or et de joyaux!',
    SCENE_VICTORY:'Vous avez vaincu le Roi des Ténèbres!',
    SCENE_DEFEAT:'Vous êtes tombé... Relevez-vous!',
    FOCUS_LBL:'Focus', SHORT_LBL:'Pause courte', LONG_LBL:'Pause longue',
    START_LBL2:'Démarrer', PAUSE_LBL:'Pause', SESSIONS_LBL:'Sessions',
    MINUTES_LBL:'Minutes', STREAK_LBL:'Série', DONE_LBL:'Session terminée!',
  },
  es:{ dir:'ltr',
    START_LBL:'Jugar', SHOP_LBL:'Tienda', BEST_LBL:'Mejor puntuación',
    SCORE_LBL:'Puntos', LEVEL_LBL:'Nivel', LIVES_LBL:'Vidas',
    GAMEOVER_LBL:'Game Over', RETRY_LBL:'Intentar de nuevo', HOME_LBL:'Inicio',
    NEW_BEST_LBL:'Nuevo récord', BACK_LBL:'Volver',
    TIME_LBL:'Tiempo', RESTART_LBL:'Nuevo juego', WIN_TITLE:'¡Ganaste!',
    PLAY_AGAIN_LBL:'Jugar de nuevo', AD_LABEL:'Los anuncios apoyan al equipo',
    AD_REMOVE_LABEL:'Eliminar $1.99',
    LAP_LBL:'Vuelta', LAPS_LBL:'Vueltas', SPEED_LBL:'Velocidad',
    POSITION_LBL:'Posición', BEST_LAP_LBL:'Mejor vuelta', FINISH_LBL:'Meta',
    RACE_START_LBL:'¡Arranca!', RACE_OVER_LBL:'Carrera terminada',
    COUNTDOWN_LBL:'Prepárate', BOOST_LBL:'Turbo', NITRO_LBL:'Nitro',
    TRACK_LBL:'Pista', OPPONENT_LBL:'Rival', QUALIFY_LBL:'Clasificación',
    RACE_WIN_LBL:'¡Ganaste la carrera!', RACE_LOSE_LBL:'Mejor suerte la próxima',
    BEST_TIME_LBL:'Mejor tiempo', KMH_LBL:'km/h',
    TEAM_LBL:'Equipo', MATCH_LBL:'Partido', GOAL_LBL:'¡Gol!',
    HALF_LBL:'Tiempo', PLAYER_LBL:'Jugador', STADIUM_LBL:'Estadio',
    CHAMPIONSHIP_LBL:'Campeonato', SCORE_HOME_LBL:'Local', SCORE_AWAY_LBL:'Visitante',
    FOUL_LBL:'Falta', PENALTY_LBL:'Penalti', MATCH_OVER_LBL:'Fin del partido',
    WIN_MATCH_LBL:'¡Tu equipo ganó!', DRAW_LBL:'Empate', LOSE_MATCH_LBL:'Perdiste',
    HERO_LBL:'Héroe', NARRATOR_LBL:'Narrador', ELDER_LBL:'Anciano', MERCHANT_LBL:'Mercader',
    ATTACK_LBL:'Ataque', MAGIC_LBL:'Magia', DEFEND_LBL:'Defensa', ITEM_LBL:'Objeto',
    COMBAT_START_LBL:'¡Comienza la batalla!', DEFEND_MSG_LBL:'Estás defendiendo',
    NO_MP_LBL:'No hay suficiente MP', NO_ITEM_LBL:'No quedan objetos', NO_GOLD_LBL:'No hay suficiente oro',
    ENEMY_WOLF:'Lobo Salvaje', ENEMY_BOSS:'Rey Oscuro',
    CHOICE_ENTER:'Entrar al pueblo', CHOICE_CAMP:'Establecer campamento',
    CHOICE_REST:'Descansar (+30 HP)', CHOICE_ACCEPT:'Aceptar la misión',
    CHOICE_SHOP:'Visitar la tienda', CHOICE_LEAVE:'Partir',
    CHOICE_BUY_POTION:'Comprar poción (15 oro)', CHOICE_FIGHT:'Luchar',
    CHOICE_SNEAK:'Pasar sigilosamente', CHOICE_BACK:'Volver',
    CHOICE_EXPLORE:'Explorar la mazmorra', CHOICE_BOSS:'Enfrentar al rey',
    CHOICE_CONTINUE:'Continuar', CHOICE_RESTART:'Empezar de nuevo',
    SCENE_INTRO:'En una noche oscura, te encuentras ante las puertas de un reino abandonado.',
    SCENE_VILLAGE:'Héroe, nuestro reino sufre. Monstruos oscuros atacan cada noche.',
    SCENE_CAMP:'El fuego te calienta. Este lugar es seguro para descansar.',
    SCENE_SHOP:'¡Bienvenido héroe! Tengo pociones y armas raras.',
    SCENE_FOREST:'El denso bosque está lleno de peligros.',
    SCENE_DUNGEON:'Has llegado a la mazmorra antigua.',
    SCENE_TREASURE:'¡Encontraste una cámara llena de oro y joyas!',
    SCENE_VICTORY:'Derrotaste al Rey Oscuro y salvaste el reino.',
    SCENE_DEFEAT:'Caíste en batalla... ¡Levántate!',
    FOCUS_LBL:'Enfoque', SHORT_LBL:'Pausa corta', LONG_LBL:'Pausa larga',
    START_LBL2:'Iniciar', PAUSE_LBL:'Pausar', SESSIONS_LBL:'Sesiones',
    MINUTES_LBL:'Minutos', STREAK_LBL:'Racha', DONE_LBL:'¡Sesión completa!',
  },
  de:{ dir:'ltr',
    START_LBL:'Spielen', SHOP_LBL:'Shop', BEST_LBL:'Bestes Ergebnis',
    SCORE_LBL:'Punkte', LEVEL_LBL:'Level', LIVES_LBL:'Leben',
    GAMEOVER_LBL:'Game Over', RETRY_LBL:'Nochmal', HOME_LBL:'Start',
    NEW_BEST_LBL:'Neuer Rekord', BACK_LBL:'Zurück',
    TIME_LBL:'Zeit', RESTART_LBL:'Neues Spiel', WIN_TITLE:'Gewonnen!',
    PLAY_AGAIN_LBL:'Nochmal', AD_LABEL:'Anzeigen unterstützen das Team',
    AD_REMOVE_LABEL:'Entfernen 1,99$',
    LAP_LBL:'Runde', LAPS_LBL:'Runden', SPEED_LBL:'Geschwindigkeit',
    POSITION_LBL:'Position', BEST_LAP_LBL:'Beste Runde', FINISH_LBL:'Ziel',
    RACE_START_LBL:'Los!', RACE_OVER_LBL:'Rennen beendet',
    COUNTDOWN_LBL:'Bereit', BOOST_LBL:'Boost', NITRO_LBL:'Nitro',
    TRACK_LBL:'Strecke', OPPONENT_LBL:'Gegner', QUALIFY_LBL:'Qualifikation',
    RACE_WIN_LBL:'Du hast das Rennen gewonnen!', RACE_LOSE_LBL:'Viel Glück beim nächsten Mal',
    BEST_TIME_LBL:'Beste Zeit', KMH_LBL:'km/h',
    TEAM_LBL:'Mannschaft', MATCH_LBL:'Spiel', GOAL_LBL:'Tor!',
    HALF_LBL:'Halbzeit', PLAYER_LBL:'Spieler', STADIUM_LBL:'Stadion',
    CHAMPIONSHIP_LBL:'Meisterschaft', SCORE_HOME_LBL:'Heim', SCORE_AWAY_LBL:'Gast',
    FOUL_LBL:'Foul', PENALTY_LBL:'Elfmeter', MATCH_OVER_LBL:'Spielende',
    WIN_MATCH_LBL:'Dein Team hat gewonnen!', DRAW_LBL:'Unentschieden', LOSE_MATCH_LBL:'Verloren',
    HERO_LBL:'Held', NARRATOR_LBL:'Erzähler', ELDER_LBL:'Ältester', MERCHANT_LBL:'Händler',
    ATTACK_LBL:'Angriff', MAGIC_LBL:'Magie', DEFEND_LBL:'Verteidigung', ITEM_LBL:'Item',
    COMBAT_START_LBL:'Der Kampf beginnt!', DEFEND_MSG_LBL:'Du verteidigst',
    NO_MP_LBL:'Nicht genug MP', NO_ITEM_LBL:'Keine Items mehr', NO_GOLD_LBL:'Nicht genug Gold',
    ENEMY_WOLF:'Wilder Wolf', ENEMY_BOSS:'Dunkler König',
    CHOICE_ENTER:'Dorf betreten', CHOICE_CAMP:'Lager aufschlagen',
    CHOICE_REST:'Ausruhen (+30 HP)', CHOICE_ACCEPT:'Quest annehmen',
    CHOICE_SHOP:'Shop besuchen', CHOICE_LEAVE:'Verlassen',
    CHOICE_BUY_POTION:'Trank kaufen (15 Gold)', CHOICE_FIGHT:'Kämpfen',
    CHOICE_SNEAK:'Schleichen', CHOICE_BACK:'Zurück',
    CHOICE_EXPLORE:'Dungeon erkunden', CHOICE_BOSS:'König herausfordern',
    CHOICE_CONTINUE:'Weiter', CHOICE_RESTART:'Neu starten',
    SCENE_INTRO:'In einer dunklen Nacht stehst du vor den Toren eines verlassenen Königreichs.',
    SCENE_VILLAGE:'Held, unser Königreich leidet. Dunkle Monster greifen jede Nacht an.',
    SCENE_CAMP:'Das Feuer wärmt dich. Dieser Ort ist sicher zum Ausruhen.',
    SCENE_SHOP:'Willkommen Held! Ich habe Heiltränke und seltene Waffen.',
    SCENE_FOREST:'Der dichte Wald ist voller Gefahren.',
    SCENE_DUNGEON:'Du hast den alten Dungeon erreicht.',
    SCENE_TREASURE:'Du hast eine Kammer voller Gold und Juwelen gefunden!',
    SCENE_VICTORY:'Du hast den Dunklen König besiegt!',
    SCENE_DEFEAT:'Du bist im Kampf gefallen... Steh auf!',
    FOCUS_LBL:'Fokus', SHORT_LBL:'Kurze Pause', LONG_LBL:'Lange Pause',
    START_LBL2:'Starten', PAUSE_LBL:'Pause', SESSIONS_LBL:'Sitzungen',
    MINUTES_LBL:'Minuten', STREAK_LBL:'Serie', DONE_LBL:'Sitzung abgeschlossen!',
  },
  zh:{ dir:'ltr',
    START_LBL:'开始游戏', SHOP_LBL:'商店', BEST_LBL:'最高分',
    SCORE_LBL:'分数', LEVEL_LBL:'等级', LIVES_LBL:'生命',
    GAMEOVER_LBL:'游戏结束', RETRY_LBL:'再试一次', HOME_LBL:'首页',
    NEW_BEST_LBL:'新纪录', BACK_LBL:'返回',
    TIME_LBL:'时间', RESTART_LBL:'新游戏', WIN_TITLE:'你赢了！',
    PLAY_AGAIN_LBL:'再玩', AD_LABEL:'广告支持我们的团队',
    AD_REMOVE_LABEL:'去除广告 $1.99',
    LAP_LBL:'圈', LAPS_LBL:'圈数', SPEED_LBL:'速度',
    POSITION_LBL:'名次', BEST_LAP_LBL:'最快圈速', FINISH_LBL:'终点',
    RACE_START_LBL:'出发！', RACE_OVER_LBL:'比赛结束',
    COUNTDOWN_LBL:'准备', BOOST_LBL:'加速', NITRO_LBL:'氮气',
    TRACK_LBL:'赛道', OPPONENT_LBL:'对手', QUALIFY_LBL:'资格赛',
    RACE_WIN_LBL:'你赢得了比赛！', RACE_LOSE_LBL:'下次好运',
    BEST_TIME_LBL:'最佳时间', KMH_LBL:'公里/小时',
    TEAM_LBL:'球队', MATCH_LBL:'比赛', GOAL_LBL:'进球！',
    HALF_LBL:'半场', PLAYER_LBL:'球员', STADIUM_LBL:'球场',
    CHAMPIONSHIP_LBL:'锦标赛', SCORE_HOME_LBL:'主队', SCORE_AWAY_LBL:'客队',
    FOUL_LBL:'犯规', PENALTY_LBL:'点球', MATCH_OVER_LBL:'比赛结束',
    WIN_MATCH_LBL:'你的球队赢了！', DRAW_LBL:'平局', LOSE_MATCH_LBL:'你输了',
    HERO_LBL:'英雄', NARRATOR_LBL:'旁白', ELDER_LBL:'长老', MERCHANT_LBL:'商人',
    ATTACK_LBL:'攻击', MAGIC_LBL:'魔法', DEFEND_LBL:'防御', ITEM_LBL:'物品',
    COMBAT_START_LBL:'战斗开始！', DEFEND_MSG_LBL:'你正在防御',
    NO_MP_LBL:'MP不足', NO_ITEM_LBL:'没有物品了', NO_GOLD_LBL:'金币不足',
    ENEMY_WOLF:'野狼', ENEMY_BOSS:'黑暗之王',
    CHOICE_ENTER:'进入村庄', CHOICE_CAMP:'建立营地',
    CHOICE_REST:'休息（恢复30HP）', CHOICE_ACCEPT:'接受任务',
    CHOICE_SHOP:'前往商店', CHOICE_LEAVE:'离开',
    CHOICE_BUY_POTION:'购买药水（15金）', CHOICE_FIGHT:'战斗',
    CHOICE_SNEAK:'悄悄通过', CHOICE_BACK:'返回',
    CHOICE_EXPLORE:'探索地牢', CHOICE_BOSS:'挑战国王',
    CHOICE_CONTINUE:'继续', CHOICE_RESTART:'重新开始',
    SCENE_INTRO:'在一个黑暗的夜晚，你发现自己站在一座废弃王国的大门前。',
    SCENE_VILLAGE:'英雄，我们的王国在受苦。黑暗怪物每晚袭击我们。',
    SCENE_CAMP:'火焰温暖着你。这里是冒险前休息的安全地方。',
    SCENE_SHOP:'欢迎英雄！我有治疗药水和稀有武器。',
    SCENE_FOREST:'茂密的森林充满危险。你听到黑暗中有狼嚎叫。',
    SCENE_DUNGEON:'你到达了古老的地牢。',
    SCENE_TREASURE:'你发现了一个充满黄金和珠宝的房间！',
    SCENE_VICTORY:'你击败了黑暗之王，拯救了王国！',
    SCENE_DEFEAT:'你在战斗中倒下了……站起来再试！',
    FOCUS_LBL:'专注', SHORT_LBL:'短暂休息', LONG_LBL:'长时间休息',
    START_LBL2:'开始', PAUSE_LBL:'暂停', SESSIONS_LBL:'次数',
    MINUTES_LBL:'分钟', STREAK_LBL:'连续', DONE_LBL:'专注完成！',
  },
};

// ── ضمان ترجمات كاملة ─────────────────────────────────────────
function ensureLang(obj, fallbackOrder = ['en','ar']) {
  if (!obj) return {};
  const LANGS = ['ar','en','fr','es','de','zh'];
  const result = {};
  LANGS.forEach(l => {
    result[l] = obj[l];
    if (!result[l]) {
      for (const fb of fallbackOrder) {
        if (obj[fb]) { result[l] = obj[fb]; break; }
      }
    }
    result[l] = result[l] || '???';
  });
  return result;
}

// ── توليد لعبة واحدة ──────────────────────────────────────────
function generate(product) {
  const tplName = TEMPLATE_MAP[product.type];
  if (!tplName) {
    console.error(`❌ Unknown type: "${product.type}" (slug: ${product.slug})`);
    console.error(`   Available types: ${Object.keys(TEMPLATE_MAP).join(', ')}`);
    return false;
  }

  const tplPath = join(__dirname, 'templates', tplName);
  let tpl;
  try { tpl = readFileSync(tplPath, 'utf8'); }
  catch(e) {
    console.error(`❌ Template file missing: ${tplName}`);
    console.error(`   Expected at: templates/${tplName}`);
    return false;
  }

  const safeName = ensureLang(product.name);
  const safeDesc = ensureLang(product.desc);
  const emojis   = product.emojis || ['🏎️','🚀','⚡','🏁','🔥','💨','🏆','⭐','🎯','💎','🌟','🎪'];
  const outDir   = join(__dirname, 'public', 'games');
  mkdirSync(outDir, { recursive: true });

  const LANGS = ['ar','en','fr','es','de','zh'];
  let built = 0;

  LANGS.forEach(lang => {
    const lbl  = LABELS[lang];
    const name = safeName[lang];
    const desc = safeDesc[lang];

    let out = tpl;

    const vars = {
      PRODUCT_TYPE: product.type,

// Art mode
ART_PLACEHOLDER:  lbl.ART_PLACEHOLDER  || 'Describe your mood...',
ART_GEN_BTN:      lbl.ART_GEN_BTN      || '✨ Generate',
ART_LOADING:      lbl.ART_LOADING      || 'Creating...',
ART_RESULT_LBL:   lbl.ART_RESULT_LBL   || 'Your Creation',

// Story mode
STORY_PLACEHOLDER: lbl.STORY_PLACEHOLDER || 'What do you do?',
STORY_SEND_BTN:    lbl.STORY_SEND_BTN    || 'Send',
STORY_THINKING:    lbl.STORY_THINKING    || 'Narrating...',
PLAYER_LBL:        lbl.PLAYER_LBL        || 'You',

// Identity mode
ID_Q1:           lbl.ID_Q1           || 'Which color speaks to you?',
ID_Q2:           lbl.ID_Q2           || 'Your inner power?',
ID_Q3:           lbl.ID_Q3           || 'Your world?',
ID_Q4:           lbl.ID_Q4           || 'What you value most?',
ID_PROGRESS_LBL: lbl.ID_PROGRESS_LBL || 'Discovery',
ID_RETRY_LBL:    lbl.ID_RETRY_LBL    || 'Try Again',
ID_TITLE_1: '🌟 The Visionary',  ID_TITLE_2: '⚡ The Catalyst',
ID_TITLE_3: '🌊 The Dreamer',    ID_TITLE_4: '🔮 The Sage',
ID_DESC_1: 'You see what others miss.',
ID_DESC_2: 'You ignite change wherever you go.',
ID_DESC_3: 'Your imagination knows no limits.',
ID_DESC_4: 'Ancient wisdom flows through you.',

// Creative mode
CREATIVE_PLACEHOLDER: lbl.CREATIVE_PLACEHOLDER || 'Enter your idea...',
CREATIVE_BTN:         lbl.CREATIVE_BTN         || 'Create',
CREATIVE_LOADING:     lbl.CREATIVE_LOADING      || 'Generating...',
      LEVELS_JSON:  JSON.stringify(product.levels || []),
      LEVELS_COUNT: (product.levels || []).length || 5,
      LANG:        lang,
      DIR:         lbl.dir,
      PRODUCT_ID:  product.id,
      GAME_NAME:   name,
      GAME_DESC:   desc,
      EMOJI:       product.emoji || '🏎️',
      ACCENT:      product.accent || '#facc15',
      ACCENT_RGB:  product.accentRgb || '250,204,21',
      IAPS_JSON:   JSON.stringify(product.iap || []),
      EMOJIS_JSON: JSON.stringify(emojis),
      // سباقات
      TOTAL_LAPS:    product.laps    || '3',
      TRACK_COUNT:   product.tracks  || '5',
      MAX_SPEED:     product.maxSpeed|| '320',
      OPPONENT_COUNT:product.opponents|| '3',
      // رياضات
      MATCH_DURATION: product.matchDuration || '90',
      TEAM_COUNT:     product.teamCount     || '2',
      // كل الترجمات
      ...lbl,
    };

    Object.entries(vars).forEach(([k, v]) => {
      out = out.split(`{{${k}}}`).join(String(v ?? ''));
    });

    const filename = lang === 'ar'
      ? `${product.slug}.html`
      : `${product.slug}-${lang}.html`;

    writeFileSync(join(outDir, filename), out, 'utf8');
    built++;
  });

  console.log(`✅ ${product.slug} (${product.type} → ${tplName}) → ${built} languages`);
  return true;
}

// ── main ──────────────────────────────────────────────────────
const products = JSON.parse(readFileSync(join(__dirname, 'products.json'), 'utf8'));
const target   = process.argv[2];
const list     = target
  ? products.filter(p => p.id === target || p.slug === target)
  : products.filter(p => p.status === 'available');

if (!list.length) { console.warn('⚠️ No products to generate'); process.exit(0); }

let ok = 0;
list.forEach(p => { if (generate(p)) ok++; });
console.log(`\n🎮 Generated: ${ok}/${list.length} × 6 languages = ${ok*6} files`);
