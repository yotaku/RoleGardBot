import { Client, GatewayIntentBits, Partials, REST, Routes, Events, SlashCommandBuilder } from 'discord.js';
import 'dotenv/config';
import fs from 'fs';
import express from 'express';

const app = express();
app.get('/', (_, res) => res.send('Bot is alive!'));
app.listen(process.env.PORT || 3000);

const LOG_CH = '1373520267023876096';
const SETTINGS_FILE = './settings.json';

// 設定読み込み
let settings = {};
if (fs.existsSync(SETTINGS_FILE)) {
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    console.warn('⚠️ 設定ファイルの読み込みに失敗しました');
  }
}

// 設定保存
function saveSettings() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// Discordログ送信
function logToDiscord(msg) {
  const ch = client.channels.cache.get(LOG_CH);
  if (ch?.isTextBased()) ch.send('```fix\n' + msg.slice(0, 1900) + '\n```');
}

// エラーハンドリング
process.on('unhandledRejection', err => {
  console.error(err);
  logToDiscord('UnhandledRejection:\n' + (err.stack || err));
});
process.on('uncaughtException', err => {
  console.error(err);
  logToDiscord('UncaughtException:\n' + (err.stack || err));
});

// 定期再起動（Renderなどの健康チェック対応）
setInterval(() => {
  logToDiscord('💤 Daily restart for health check');
  process.exit(0);
}, 24 * 60 * 60 * 1000);

// Discordクライアント初期化
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// コマンド定義
const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('監視チャンネルと許可ロールを登録')
    .addChannelOption(option =>
      option.setName('channel').setDescription('監視対象チャンネル').setRequired(true))
    .addRoleOption(option =>
      option.setName('role').setDescription('発言を許可するロール').setRequired(true))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('現在の監視設定を表示')
    .toJSON()
];

// スラッシュコマンドを登録（開発用：ギルド限定）
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ スラッシュコマンドを登録しました。');
  } catch (err) {
    console.error('❌ コマンド登録エラー:', err);
  }
})();

// コマンド処理
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'setup') {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: 'このコマンドは管理者のみ使用できます。', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');
    const role = interaction.options.getRole('role');

    settings[interaction.guildId] = {
      channelId: channel.id,
      roleId: role.id
    };
    saveSettings();

    await interaction.reply({
      content: `✅ 設定完了：\n- 監視チャンネル：#${channel.name}\n- 許可ロール：@${role.name}`,
      ephemeral: true
    });
  }

  if (interaction.commandName === 'status') {
    const conf = settings[interaction.guildId];
    if (!conf) {
      return interaction.reply({ content: '⚠️ このサーバーではまだ設定されていません。', ephemeral: true });
    }

    const channel = await interaction.guild.channels.fetch(conf.channelId).catch(() => null);
    const role = await interaction.guild.roles.fetch(conf.roleId).catch(() => null);

    const channelName = channel ? `#${channel.name}` : '（チャンネルが見つかりません）';
    const roleName = role ? `@${role.name}` : '（ロールが見つかりません）';

    return interaction.reply({
      content: `📊 現在の設定：\n- 監視チャンネル: ${channelName}\n- 許可ロール: ${roleName}`,
      ephemeral: true
    });
  }
});

// メッセージ監視処理
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.inGuild()) return;

  const conf = settings[message.guildId];
  if (!conf || message.channelId !== conf.channelId) return;

  const member = message.member;
  if (!member || member.roles.cache.has(conf.roleId)) return;

  const channelName = message.channel?.name ?? '指定チャンネル';

  try {
    await message.author.send(`⚠️ あなたは「#${channelName}」での発言権限がありません。`);
  } catch (err) {
    console.warn(`⚠️ ${message.author.tag} にDMを送信できませんでした`);
  }

  try {
    await message.delete();
  } catch (err) {
    console.warn(`⚠️ メッセージ削除失敗: ${err}`);
  }
});

// 起動ログ
client.once(Events.ClientReady, () => {
  console.log(`🤖 ログイン完了: ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
