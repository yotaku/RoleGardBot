// ---- 既存 bot.js の先頭付近に追記 ----
const LOG_CH = 'https://discord.com/channels/1296438818379005974/1296459562299424788';

function logToDiscord(msg) {
  const ch = client.channels.cache.get(LOG_CH);
  if (ch?.isTextBased()) ch.send('```fix\n' + msg.slice(0,1900) + '\n```');
}

process.on('unhandledRejection', err => {
  console.error(err);
  logToDiscord('UnhandledRejection:\n' + err.stack);
});

process.on('uncaughtException', err => {
  console.error(err);
  logToDiscord('UncaughtException:\n' + err.stack);
});

// 24時間ごとに強制再起動（任意）
setInterval(() => {
  logToDiscord('💤 Daily restart for health check');
  process.exit(0);
}, 24 * 60 * 60 * 1000);

import { Client, GatewayIntentBits, Partials, REST, Routes, Events, SlashCommandBuilder } from 'discord.js';
import 'dotenv/config';

// Bot クライアント初期化
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]  // DM用に必要
});

// 設定情報（guildId → { channelId, roleId }）
// 少数ギルドならメモリ保存で十分。必要ならDBに置き換え可
const settings = new Map();

/* スラッシュコマンド定義 */
const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('監視チャンネルと許可ロールを登録')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('監視対象チャンネル')
        .setRequired(true))
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('発言を許可するロール')
        .setRequired(true))
    .toJSON(),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('現在の監視設定を表示')
    .toJSON()
];

// スラッシュコマンドを Discord に登録
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ スラッシュコマンドを登録しました。');
  } catch (err) {
    console.error('❌ コマンド登録エラー:', err);
  }
})();

/* コマンド処理 */
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'setup') {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: 'このコマンドは管理者のみ使用できます。', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');
    const role = interaction.options.getRole('role');

    settings.set(interaction.guildId, {
      channelId: channel.id,
      roleId: role.id
    });

    await interaction.reply({
      content: `✅ 設定完了：\n- 監視チャンネル：#${channel.name}\n- 許可ロール：@${role.name}`,
      ephemeral: true
    });
  }

  if (interaction.commandName === 'status') {
    const conf = settings.get(interaction.guildId);
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

/* メッセージ監視処理 */
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.inGuild()) return;

  const conf = settings.get(message.guildId);
  if (!conf) return;
  if (message.channelId !== conf.channelId) return;

  // 許可ロールを持っていれば何もしない
  if (message.member.roles.cache.has(conf.roleId)) return;

  // DM で警告を送信
  try {
    await message.author.send(`⚠️ あなたは「#${message.channel.name}」での発言権限がありません。`);
  } catch (err) {
    console.log(`⚠️ ${message.author.tag} にDMを送信できませんでした`);
  }

  // メッセージ削除
  try {
    await message.delete();
  } catch (err) {
    console.log(`⚠️ メッセージ削除失敗: ${err}`);
  }
});

/* Bot起動 */
client.once(Events.ClientReady, () => {
  console.log(`🤖 ログイン完了: ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);
