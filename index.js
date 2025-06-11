const express = require('express');
const fetch = require('node-fetch');
const app = express();

const API_KEY = '23c8059826e5d20151b4574dac9d07d9';

app.get('/weather', async (req, res) => {
  const lat = 35.7014; // 武蔵境駅の緯度
  const lon = 139.5455; // 武蔵境駅の経度

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=ja`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json({
      weather: data.weather[0].description,
      temp: data.main.temp
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch weather' });
  }
});

app.listen(3000, () => {
  console.log('Server running');
});
