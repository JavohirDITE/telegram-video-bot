import { Telegraf, Markup } from "telegraf"
import fs from "fs/promises"
import path from "path"

// Конфигурация бота
const config = {
  // Замените на ваш токен от BotFather
  botToken: process.env.BOT_TOKEN || "7521191742:AAHrdBmRSTLCaYfII-GWd3-40uGZdWAu2Ts",
  // ID администратора (замените на свой)
  adminId: process.env.ADMIN_ID || "1395804259",
  // ID канала для обязательной подписки (с @)
  requiredChannel: process.env.CHANNEL_ID || "-1002593005218",
  // Список видео
  videos: [
    { id: 1, title: "Видео 1", url: "https://example.com/video1" },
    { id: 2, title: "Видео 2", url: "https://example.com/video2" },
    { id: 3, title: "Видео 3", url: "https://example.com/video3" },
    { id: 4, title: "Видео 4", url: "https://example.com/video4" },
    { id: 5, title: "Видео 5", url: "https://example.com/video5" },
    { id: 6, title: "Видео 6", url: "https://example.com/video6" },
  ],
}

// Инициализация бота
const bot = new Telegraf(config.botToken)

// Путь к файлу базы данных
const DB_PATH = path.join(process.cwd(), "users.json")

// Функции для работы с базой данных
async function readDB() {
  try {
    const data = await fs.readFile(DB_PATH, "utf8")
    return JSON.parse(data)
  } catch (error) {
    // Если файл не существует, создаем пустую базу данных
    return { users: {} }
  }
}

async function writeDB(data) {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), "utf8")
}

async function getUser(userId) {
  const db = await readDB()
  if (!db.users[userId]) {
    db.users[userId] = {
      lastWatchedVideo: 0,
      completedVideos: [],
    }
    await writeDB(db)
  }
  return db.users[userId]
}

async function updateUser(userId, data) {
  const db = await readDB()
  db.users[userId] = { ...db.users[userId], ...data }
  await writeDB(db)
}

async function markVideoAsWatched(userId, videoId) {
  const user = await getUser(userId)
  if (!user.completedVideos.includes(videoId)) {
    user.completedVideos.push(videoId)
    user.lastWatchedVideo = Math.max(user.lastWatchedVideo, videoId)
    await updateUser(userId, user)
  }
}

// Проверка подписки на канал
async function checkSubscription(ctx) {
  try {
    const userId = ctx.from.id
    const member = await ctx.telegram.getChatMember(config.requiredChannel, userId)
    return ["creator", "administrator", "member"].includes(member.status)
  } catch (error) {
    console.error("Ошибка при проверке подписки:", error)
    return false
  }
}

// Создание клавиатуры с видео
async function createVideoKeyboard(userId) {
  const user = await getUser(userId)
  const keyboard = []

  for (const video of config.videos) {
    // Пользователь может смотреть следующее видео только если посмотрел предыдущее
    // или это первое видео
    const isAvailable = video.id === 1 || user.lastWatchedVideo >= video.id - 1
    const status = user.completedVideos.includes(video.id) ? "✅ " : isAvailable ? "🔓 " : "🔒 "

    keyboard.push([Markup.button.callback(`${status}${video.title}`, isAvailable ? `watch_${video.id}` : "locked")])
  }

  return Markup.inlineKeyboard(keyboard)
}

// Обработчик команды /start
bot.start(async (ctx) => {
  const userId = ctx.from.id
  const user = await getUser(userId)

  // Отправляем уведомление администратору
  bot.telegram.sendMessage(
    config.adminId,
    `🔔 Новый пользователь начал использовать бота:\nID: ${userId}\nИмя: ${ctx.from.first_name} ${ctx.from.last_name || ""}\nUsername: @${ctx.from.username || "отсутствует"}`,
  )

  await ctx.reply(
    `👋 Привет, ${ctx.from.first_name}!\n\nЭто бот с обучающими видео. Для продолжения вам необходимо подписаться на канал ${config.requiredChannel}.`,
    Markup.inlineKeyboard([
      [Markup.button.url("Подписаться на канал", `https://t.me/${config.requiredChannel.replace("@", "")}`)],
    ]),
  )

  // Добавляем кнопку для проверки подписки
  await ctx.reply(
    "После подписки нажмите кнопку ниже:",
    Markup.inlineKeyboard([[Markup.button.callback("Я подписался", "check_subscription")]]),
  )
})

// Обработчик проверки подписки
bot.action("check_subscription", async (ctx) => {
  const isSubscribed = await checkSubscription(ctx)

  if (isSubscribed) {
    await ctx.answerCbQuery("Спасибо за подписку!")
    await ctx.reply("✅ Подписка подтверждена! Теперь вы можете смотреть видео.")

    // Показываем список видео
    const keyboard = await createVideoKeyboard(ctx.from.id)
    await ctx.reply("📚 Выберите видео для просмотра:", keyboard)
  } else {
    await ctx.answerCbQuery("Вы не подписаны на канал", { show_alert: true })
    await ctx.reply(
      `❌ Вы не подписаны на канал ${config.requiredChannel}. Пожалуйста, подпишитесь для доступа к видео.`,
      Markup.inlineKeyboard([
        [Markup.button.url("Подписаться на канал", `https://t.me/${config.requiredChannel.replace("@", "")}`)],
      ]),
    )
  }
})

// Обработчик для заблокированных видео
bot.action("locked", async (ctx) => {
  await ctx.answerCbQuery("Сначала посмотрите предыдущие видео!", { show_alert: true })
})

// Обработчик для просмотра видео
bot.action(/watch_(\d+)/, async (ctx) => {
  const isSubscribed = await checkSubscription(ctx)

  if (!isSubscribed) {
    await ctx.answerCbQuery("Вы не подписаны на канал", { show_alert: true })
    await ctx.reply(
      `❌ Вы не подписаны на канал ${config.requiredChannel}. Пожалуйста, подпишитесь для доступа к видео.`,
      Markup.inlineKeyboard([
        [Markup.button.url("Подписаться на канал", `https://t.me/${config.requiredChannel.replace("@", "")}`)],
      ]),
    )
    return
  }

  const videoId = Number.parseInt(ctx.match[1])
  const video = config.videos.find((v) => v.id === videoId)

  if (!video) {
    await ctx.answerCbQuery("Видео не найдено")
    return
  }

  await ctx.answerCbQuery(`Открываю ${video.title}`)

  // Отправляем видео
  await ctx.reply(`🎬 *${video.title}*\n\nСсылка на видео: ${video.url}`, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.url("Смотреть видео", video.url)],
      [Markup.button.callback("Отметить как просмотренное", `complete_${videoId}`)],
    ]),
  })
})

// Обработчик для отметки видео как просмотренного
bot.action(/complete_(\d+)/, async (ctx) => {
  const videoId = Number.parseInt(ctx.match[1])
  const userId = ctx.from.id

  await markVideoAsWatched(userId, videoId)
  await ctx.answerCbQuery(`Видео ${videoId} отмечено как просмотренное!`)

  const user = await getUser(userId)

  // Проверяем, все ли видео просмотрены
  if (user.completedVideos.length === config.videos.length) {
    await ctx.reply("🎉 Поздравляем! Вы просмотрели все видео курса!")
  }

  // Обновляем клавиатуру с видео
  const keyboard = await createVideoKeyboard(userId)
  await ctx.reply("📚 Выберите видео для просмотра:", keyboard)
})

// Обработчик команды /videos для показа списка видео
bot.command("videos", async (ctx) => {
  const isSubscribed = await checkSubscription(ctx)

  if (!isSubscribed) {
    await ctx.reply(
      `❌ Вы не подписаны на канал ${config.requiredChannel}. Пожалуйста, подпишитесь для доступа к видео.`,
      Markup.inlineKeyboard([
        [Markup.button.url("Подписаться на канал", `https://t.me/${config.requiredChannel.replace("@", "")}`)],
      ]),
    )
    return
  }

  const keyboard = await createVideoKeyboard(ctx.from.id)
  await ctx.reply("📚 Выберите видео для просмотра:", keyboard)
})

// Запуск бота
bot
  .launch()
  .then(() => {
    console.log("Бот запущен!")
  })
  .catch((err) => {
    console.error("Ошибка при запуске бота:", err)
  })

// Обработка остановки бота
process.once("SIGINT", () => bot.stop("SIGINT"))
process.once("SIGTERM", () => bot.stop("SIGTERM"))
