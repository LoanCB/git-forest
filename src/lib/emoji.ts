const VS16 = "️";

/**
 * The gitmoji list (gitmoji.dev) plus a few common GitHub shortcodes.
 * Characters that default to text presentation carry VS16 so they render as emoji.
 */
const EMOJI = new Map<string, string>(
	Object.entries({
		// gitmoji
		art: "🎨",
		zap: `⚡${VS16}`,
		fire: "🔥",
		bug: "🐛",
		ambulance: "🚑",
		sparkles: "✨",
		memo: "📝",
		rocket: "🚀",
		lipstick: "💄",
		tada: "🎉",
		white_check_mark: "✅",
		lock: "🔒",
		closed_lock_with_key: "🔐",
		bookmark: "🔖",
		rotating_light: "🚨",
		construction: "🚧",
		green_heart: "💚",
		arrow_down: `⬇${VS16}`,
		arrow_up: `⬆${VS16}`,
		pushpin: "📌",
		construction_worker: "👷",
		chart_with_upwards_trend: "📈",
		recycle: `♻${VS16}`,
		heavy_plus_sign: "➕",
		heavy_minus_sign: "➖",
		wrench: "🔧",
		hammer: "🔨",
		globe_with_meridians: "🌐",
		pencil2: `✏${VS16}`,
		poop: "💩",
		rewind: "⏪",
		twisted_rightwards_arrows: "🔀",
		package: "📦",
		alien: "👽",
		truck: "🚚",
		page_facing_up: "📄",
		boom: "💥",
		bento: "🍱",
		wheelchair: "♿",
		bulb: "💡",
		beers: "🍻",
		speech_balloon: "💬",
		card_file_box: `🗃${VS16}`,
		loud_sound: "🔊",
		mute: "🔇",
		busts_in_silhouette: "👥",
		children_crossing: "🚸",
		building_construction: `🏗${VS16}`,
		iphone: "📱",
		clown_face: "🤡",
		egg: "🥚",
		see_no_evil: "🙈",
		camera_flash: "📸",
		alembic: `⚗${VS16}`,
		mag: "🔍",
		label: `🏷${VS16}`,
		seedling: "🌱",
		triangular_flag_on_post: "🚩",
		goal_net: "🥅",
		dizzy: "💫",
		wastebasket: `🗑${VS16}`,
		passport_control: "🛂",
		adhesive_bandage: "🩹",
		monocle_face: "🧐",
		coffin: `⚰${VS16}`,
		test_tube: "🧪",
		necktie: "👔",
		stethoscope: "🩺",
		bricks: "🧱",
		technologist: "🧑‍💻",
		money_with_wings: "💸",
		thread: "🧵",
		safety_vest: "🦺",
		airplane: `✈${VS16}`,
		// retired gitmoji still found in older histories
		pencil: "📝",
		apple: "🍎",
		green_apple: "🍏",
		penguin: "🐧",
		checkered_flag: "🏁",
		robot: "🤖",
		shirt: "👕",
		lock_with_ink_pen: "🔏",
		// common GitHub shortcodes
		heavy_check_mark: `✔${VS16}`,
		x: "❌",
		warning: `⚠${VS16}`,
		star: "⭐",
		books: "📚",
		gear: `⚙${VS16}`,
		link: "🔗",
		hourglass: "⌛",
		eyes: "👀",
		heart: `❤${VS16}`,
		"+1": "👍",
		"-1": "👎",
		smile: "😄",
		wave: "👋",
		pray: "🙏",
		no_entry: "⛔",
		arrow_right: `➡${VS16}`,
		white_circle: "⚪",
		new: "🆕",
		information_source: `ℹ${VS16}`,
		broom: "🧹",
		scroll: "📜",
		sos: "🆘",
		key: "🔑",
		mega: "📣",
		trophy: "🏆",
	}),
);

const SHORTCODE = /:([a-z0-9_+-]+):/g;
const WORD = /\w/;

/**
 * Turns `:sparkles:` into ✨ for display. Unknown codes and codes glued to a
 * word (`a:b:c`, `12:30:45`) stay literal.
 */
export function replaceShortcodes(text: string): string {
	if (!text.includes(":")) return text;
	return text.replace(SHORTCODE, (match, code: string, at: number) => {
		const emoji = EMOJI.get(code);
		if (!emoji) return match;
		const before = text[at - 1];
		const after = text[at + match.length];
		if ((before && WORD.test(before)) || (after && WORD.test(after)))
			return match;
		return emoji;
	});
}
