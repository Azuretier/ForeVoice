import {
    Client,
    GatewayIntentBits,
    Message,
    Events,
    VoiceChannel,
} from 'discord.js';
import {
    joinVoiceChannel,
    VoiceConnectionStatus,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    EndBehaviorType,
    StreamType,
} from '@discordjs/voice';
import { config } from './config';
import WebSocket from 'ws';
import prism from 'prism-media';
import { Readable, Transform } from 'stream';

// Gemini Live API configuration
const GEMINI_API_KEY = config.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.0-flash-exp'; // or your preferred model
const URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

/**
 * Resample audio from one sample rate to another using linear interpolation
 * @param input - Input buffer (16-bit PCM)
 * @param fromRate - Source sample rate
 * @param toRate - Target sample rate
 * @returns Resampled buffer
 */
function resampleAudio(input: Buffer, fromRate: number, toRate: number): Buffer {
    const ratio = fromRate / toRate;
    const inputSamples = input.length / 2; // 16-bit = 2 bytes per sample
    const outputSamples = Math.floor(inputSamples / ratio);
    const output = Buffer.alloc(outputSamples * 2);

    for (let i = 0; i < outputSamples; i++) {
        const srcIndex = i * ratio;
        const srcIndexFloor = Math.floor(srcIndex);
        const srcIndexCeil = Math.min(srcIndexFloor + 1, inputSamples - 1);
        const fraction = srcIndex - srcIndexFloor;

        const sample1 = input.readInt16LE(srcIndexFloor * 2);
        const sample2 = input.readInt16LE(srcIndexCeil * 2);

        // Linear interpolation
        const interpolated = Math.round(sample1 + (sample2 - sample1) * fraction);
        output.writeInt16LE(Math.max(-32768, Math.min(32767, interpolated)), i * 2);
    }

    return output;
}

/**
 * Create a readable stream from a buffer for audio playback
 */
function bufferToStream(buffer: Buffer): Readable {
    const readable = new Readable({
        read() {
            this.push(buffer);
            this.push(null);
        },
    });
    return readable;
}

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user?.tag}`);
});

client.on(Events.MessageCreate, async (message: Message) => {
    if (message.content === '!close') {
        await message.reply('Shutting down...');
        client.destroy();
        process.exit(0);
    }

    if (message.content === '!chat') {
        const channel = message.member?.voice.channel as VoiceChannel | null;
        if (!channel) {
            await message.reply('You need to be in a voice channel!');
            return;
        }

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: false,
        });

        const player = createAudioPlayer();
        connection.subscribe(player);

        // Audio queue for smooth playback
        const audioQueue: Buffer[] = [];
        let isPlaying = false;

        const playNextInQueue = () => {
            if (audioQueue.length === 0) {
                isPlaying = false;
                return;
            }

            isPlaying = true;
            const audioBuffer = audioQueue.shift()!;

            // Resample from 16kHz (Gemini) to 48kHz (Discord)
            const resampled = resampleAudio(audioBuffer, 16000, 48000);

            const resource = createAudioResource(bufferToStream(resampled), {
                inputType: StreamType.Raw,
                inlineVolume: true,
            });

            player.play(resource);
        };

        player.on(AudioPlayerStatus.Idle, () => {
            playNextInQueue();
        });

        // 1. Gemini WebSocket connection
        const geminiWs = new WebSocket(URL);

        geminiWs.on('open', () => {
            console.log('Connected to Gemini Live API');
            // Send initial setup
            const setup = {
                setup: {
                    model: `models/${MODEL}`,
                    generationConfig: {
                        responseModalities: ['AUDIO'],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: {
                                    voiceName: 'Aoede', // or other voice options
                                },
                            },
                        },
                    },
                },
            };
            geminiWs.send(JSON.stringify(setup));
        });

        geminiWs.on('error', (error) => {
            console.error('Gemini WebSocket error:', error);
        });

        geminiWs.on('close', () => {
            console.log('Gemini WebSocket closed');
        });

        // 2. Process audio responses from Gemini
        geminiWs.on('message', (data: WebSocket.Data) => {
            try {
                const response = JSON.parse(data.toString());

                // Handle setup complete
                if (response.setupComplete) {
                    console.log('Gemini setup complete');
                    return;
                }

                // AI returned audio
                if (response.serverContent?.modelTurn?.parts) {
                    for (const part of response.serverContent.modelTurn.parts) {
                        if (part.inlineData?.mimeType?.startsWith('audio/')) {
                            const audioBase64 = part.inlineData.data;
                            const audioBuffer = Buffer.from(audioBase64, 'base64');

                            // Queue audio for playback
                            audioQueue.push(audioBuffer);

                            if (!isPlaying) {
                                playNextInQueue();
                            }
                        }
                    }
                }

                // Handle turn complete
                if (response.serverContent?.turnComplete) {
                    console.log('Gemini turn complete');
                }
            } catch (error) {
                console.error('Error parsing Gemini response:', error);
            }
        });

        // 3. Monitor user voice and send to Gemini
        connection.on(VoiceConnectionStatus.Ready, () => {
            console.log('Voice connection ready');

            connection.receiver.speaking.on('start', (userId) => {
                console.log(`User ${userId} started speaking`);

                // Get user's audio stream (Opus encoded)
                const opusStream = connection.receiver.subscribe(userId, {
                    end: {
                        behavior: EndBehaviorType.AfterSilence,
                        duration: 1000, // Stop after 1 second of silence
                    },
                });

                // Decode Opus to PCM (48kHz, mono, 16-bit)
                const decoder = new prism.opus.Decoder({
                    rate: 48000,
                    channels: 1,
                    frameSize: 960,
                });

                const pcmStream = opusStream.pipe(decoder);

                // Collect audio chunks
                const chunks: Buffer[] = [];

                pcmStream.on('data', (chunk: Buffer) => {
                    chunks.push(chunk);
                });

                pcmStream.on('end', () => {
                    if (chunks.length === 0) return;

                    // Combine all chunks
                    const fullBuffer = Buffer.concat(chunks);

                    // Resample from 48kHz to 16kHz for Gemini
                    const resampled = resampleAudio(fullBuffer, 48000, 16000);

                    // Send to Gemini
                    if (geminiWs.readyState === WebSocket.OPEN) {
                        geminiWs.send(
                            JSON.stringify({
                                realtimeInput: {
                                    mediaChunks: [
                                        {
                                            mimeType: 'audio/pcm;rate=16000',
                                            data: resampled.toString('base64'),
                                        },
                                    ],
                                },
                            })
                        );
                        console.log(`Sent ${resampled.length} bytes of audio to Gemini`);
                    }
                });

                pcmStream.on('error', (error) => {
                    console.error('PCM stream error:', error);
                });
            });
        });

        connection.on(VoiceConnectionStatus.Disconnected, () => {
            console.log('Voice connection disconnected');
            geminiWs.close();
        });

        await message.reply('Joined voice channel! Say something and I\'ll respond.');
    }

    // Command to leave voice channel
    if (message.content === '!leave') {
        const channel = message.member?.voice.channel;
        if (channel) {
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
            });
            connection.destroy();
            await message.reply('Left the voice channel!');
        }
    }
});

client.login(config.DISCORD_TOKEN);