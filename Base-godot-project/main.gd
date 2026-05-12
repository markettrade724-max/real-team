extends Node

# يقوم بقراءة ملف game_config.json الذي يضعه godot-agent.js
# ويخصص اللعبة حسب الإعدادات الممررة

var config = {}
var game_name = "New Game"
var accent_color = Color.WHITE
var emoji = "🎮"

func _ready():
	# قراءة ملف التكوين
	_load_config()
	
	# تخصيص الواجهة
	$Label.text = emoji + " " + game_name
	$Label.add_theme_color_override("font_color", accent_color)
	
	print("Game loaded: ", game_name)

func _load_config():
	var file = FileAccess.open("res://game_config.json", FileAccess.READ)
	if file == null:
		print("No game_config.json found, using defaults")
		return
	
	var json_string = file.get_as_text()
	file.close()
	
	var json = JSON.new()
	var error = json.parse(json_string)
	if error == OK:
		config = json.data
		game_name = config.get("game_name", "New Game")
		emoji = config.get("emoji", "🎮")
		var acc = config.get("accent", "#FFFFFF")
		accent_color = Color(acc)
		
		# هنا يمكنك إضافة المزيد من التخصيصات
		# مثل تحميل مشهد معين، أو ضبط سرعة اللاعب، إلخ
