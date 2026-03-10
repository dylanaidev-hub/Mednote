import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

// Open-Meteo API — completely free, no API key needed
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = 'https://nominatim.openstreetmap.org/reverse';
const CACHE_KEY = '@mednote_weather_cache_v2';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

export interface WeatherData {
    temp: number;
    feelsLike: number;
    humidity: number;
    condition: string; // 'Clear', 'Rain', 'Clouds', 'Drizzle', 'Thunderstorm', 'Snow', 'Mist', etc.
    description: string; // Vietnamese description
    icon: string; // day 'd' or night 'n' suffix
    cityName: string;
    windSpeed: number;
}

interface CachedWeather {
    data: WeatherData;
    timestamp: number;
}

// ─── WMO Weather Code Mapping ────────────────────────────────
// Maps WMO weather codes to condition names and Vietnamese descriptions
function parseWMOCode(code: number): { condition: string; description: string } {
    if (code === 0) return { condition: 'Clear', description: 'Trời quang' };
    if (code === 1) return { condition: 'Clear', description: 'Trời hầu như quang' };
    if (code === 2) return { condition: 'Clouds', description: 'Có mây rải rác' };
    if (code === 3) return { condition: 'Clouds', description: 'Trời u ám' };
    if (code >= 45 && code <= 48) return { condition: 'Fog', description: 'Sương mù' };
    if (code >= 51 && code <= 55) return { condition: 'Drizzle', description: 'Mưa phùn' };
    if (code >= 56 && code <= 57) return { condition: 'Drizzle', description: 'Mưa phùn lạnh' };
    if (code >= 61 && code <= 65) return { condition: 'Rain', description: code <= 62 ? 'Mưa nhẹ' : 'Mưa vừa đến nặng' };
    if (code >= 66 && code <= 67) return { condition: 'Rain', description: 'Mưa lạnh' };
    if (code >= 71 && code <= 77) return { condition: 'Snow', description: 'Tuyết rơi' };
    if (code >= 80 && code <= 82) return { condition: 'Rain', description: 'Mưa rào' };
    if (code >= 85 && code <= 86) return { condition: 'Snow', description: 'Mưa tuyết' };
    if (code === 95) return { condition: 'Thunderstorm', description: 'Giông bão' };
    if (code >= 96 && code <= 99) return { condition: 'Thunderstorm', description: 'Giông bão có mưa đá' };
    return { condition: 'Clear', description: 'Trời quang' };
}

// ─── Reverse Geocode ─────────────────────────────────────────
async function getCityName(lat: number, lon: number): Promise<string> {
    try {
        // Try expo-location's reverse geocoding first
        const locations = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
        if (locations && locations.length > 0) {
            const loc = locations[0];
            return loc.city || loc.subregion || loc.region || loc.district || 'Vị trí hiện tại';
        }
        return 'Vị trí hiện tại';
    } catch {
        return 'Vị trí hiện tại';
    }
}

// ─── API Call ────────────────────────────────────────────────
export async function fetchWeather(lat: number, lon: number): Promise<WeatherData | null> {
    try {
        // Check cache first
        const cached = await getCachedWeather();
        if (cached) return cached;

        // Fetch weather + city name in parallel
        const [weatherResponse, cityName] = await Promise.all([
            fetch(`${WEATHER_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`),
            getCityName(lat, lon),
        ]);

        if (!weatherResponse.ok) {
            console.warn('Weather API error:', weatherResponse.status);
            return null;
        }

        const json = await weatherResponse.json();
        const current = json.current;

        const wmoCode = current.weather_code;
        const { condition, description } = parseWMOCode(wmoCode);

        // Determine day/night based on current hour
        const hour = new Date().getHours();
        const isDaytime = hour >= 6 && hour < 18;

        const weatherData: WeatherData = {
            temp: Math.round(current.temperature_2m),
            feelsLike: Math.round(current.apparent_temperature),
            humidity: current.relative_humidity_2m,
            condition,
            description,
            icon: isDaytime ? '01d' : '01n', // day/night indicator
            cityName,
            windSpeed: current.wind_speed_10m,
        };

        // Cache result
        await cacheWeather(weatherData);

        return weatherData;
    } catch (error) {
        console.error('Failed to fetch weather:', error);
        return null;
    }
}

// ─── Cache Management ────────────────────────────────────────
async function getCachedWeather(): Promise<WeatherData | null> {
    try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (!raw) return null;

        const cached: CachedWeather = JSON.parse(raw);
        const age = Date.now() - cached.timestamp;

        if (age < CACHE_DURATION) {
            return cached.data;
        }

        return null; // Cache expired
    } catch {
        return null;
    }
}

async function cacheWeather(data: WeatherData): Promise<void> {
    try {
        const cached: CachedWeather = {
            data,
            timestamp: Date.now(),
        };
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    } catch (error) {
        console.warn('Failed to cache weather:', error);
    }
}

// ─── Contextual Health Advice ────────────────────────────────
export function getWeatherAdvice(weather: WeatherData): string {
    const { temp, humidity, condition } = weather;

    // Rain conditions
    if (['Rain', 'Drizzle', 'Thunderstorm'].includes(condition)) {
        return 'Trời mưa, hãy mang thuốc trong túi kín nước khi ra ngoài và bổ sung vitamin D nhé.';
    }

    // Very hot
    if (temp >= 35) {
        return 'Nắng nóng gay gắt, đừng quên uống đủ nước khi dùng thuốc.';
    }

    // Hot + humid
    if (temp > 30 && humidity > 75) {
        return 'Hôm nay trời nồm ẩm, hãy nhớ đóng kín nắp lọ thuốc nhé.';
    }

    // Cold
    if (temp < 15) {
        return 'Trời sắp trở lạnh, hãy chú ý giữ ấm vùng cổ và ngực.';
    }

    // Cloudy / overcast
    if (condition === 'Clouds') {
        return 'Trời âm u, hãy duy trì tinh thần tích cực và uống thuốc đúng giờ nhé.';
    }

    // Clear / sunny
    if (condition === 'Clear' && temp >= 25) {
        return 'Trời nắng đẹp, hãy tập thể dục nhẹ và uống thuốc đúng giờ nhé.';
    }

    // Fog
    if (['Mist', 'Fog', 'Haze'].includes(condition)) {
        return 'Trời sương mù, hãy cẩn thận khi di chuyển và giữ ấm cơ thể.';
    }

    return 'Hãy luôn uống thuốc đúng giờ và giữ gìn sức khỏe nhé!';
}

// ─── Storage Warning ─────────────────────────────────────────
export function getStorageWarning(temp: number): string | null {
    if (temp > 30) {
        return `⚠️ Nhiệt độ đang ${temp}°C, hãy kiểm tra lại điều kiện bảo quản thuốc.`;
    }
    return null;
}

// ─── Dynamic Theme Colors ────────────────────────────────────
export interface WeatherTheme {
    gradientColors: string[];
    textColor: string;
    accentColor: string;
    iconColor: string;
}

export function getWeatherTheme(condition: string): WeatherTheme {
    switch (condition) {
        case 'Clear':
            return {
                gradientColors: ['#fef3c7', '#fde68a'],
                textColor: '#92400e',
                accentColor: '#d97706',
                iconColor: '#f59e0b',
            };
        case 'Rain':
        case 'Drizzle':
        case 'Thunderstorm':
            return {
                gradientColors: ['#dbeafe', '#bfdbfe'],
                textColor: '#1e3a5f',
                accentColor: '#2563eb',
                iconColor: '#3b82f6',
            };
        case 'Clouds':
            return {
                gradientColors: ['#f3f4f6', '#e5e7eb'],
                textColor: '#374151',
                accentColor: '#6b7280',
                iconColor: '#9ca3af',
            };
        case 'Snow':
            return {
                gradientColors: ['#eff6ff', '#dbeafe'],
                textColor: '#1e40af',
                accentColor: '#3b82f6',
                iconColor: '#60a5fa',
            };
        case 'Fog':
        case 'Mist':
        case 'Haze':
            return {
                gradientColors: ['#f9fafb', '#f3f4f6'],
                textColor: '#4b5563',
                accentColor: '#9ca3af',
                iconColor: '#d1d5db',
            };
        default:
            return {
                gradientColors: ['#eff6ff', '#dbeafe'],
                textColor: '#1e3a5f',
                accentColor: '#2563eb',
                iconColor: '#3b82f6',
            };
    }
}

// ─── Weather Emoji Icon ──────────────────────────────────────
export function getWeatherEmoji(condition: string, iconCode?: string): string {
    const isNight = iconCode ? iconCode.endsWith('n') : false;

    switch (condition) {
        case 'Clear':
            return isNight ? '🌙' : '☀️';
        case 'Clouds':
            return isNight ? '☁️' : '⛅';
        case 'Rain':
            return '🌧️';
        case 'Drizzle':
            return '🌦️';
        case 'Thunderstorm':
            return '⛈️';
        case 'Snow':
            return '❄️';
        case 'Fog':
        case 'Mist':
            return '🌫️';
        case 'Haze':
            return '🌁';
        default:
            return isNight ? '🌙' : '🌤️';
    }
}

// ─── Weather Ionicon Name (for badges/secondary use) ─────────
export function getWeatherIconName(condition: string): string {
    switch (condition) {
        case 'Clear':
            return 'sunny';
        case 'Clouds':
            return 'cloudy';
        case 'Rain':
        case 'Drizzle':
            return 'rainy';
        case 'Thunderstorm':
            return 'thunderstorm';
        case 'Snow':
            return 'snow';
        case 'Fog':
        case 'Mist':
        case 'Haze':
            return 'cloud';
        default:
            return 'partly-sunny';
    }
}

// ─── Time-based Greeting ─────────────────────────────────────
export function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 11) return 'Chào buổi sáng';
    if (hour < 14) return 'Chào buổi trưa';
    if (hour < 18) return 'Chào buổi chiều';
    return 'Chào buổi tối';
}
