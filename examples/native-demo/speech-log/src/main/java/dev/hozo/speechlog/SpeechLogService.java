package dev.hozo.speechlog;

import android.media.AudioFormat;
import android.speech.tts.SynthesisCallback;
import android.speech.tts.SynthesisRequest;
import android.speech.tts.TextToSpeech;
import android.speech.tts.TextToSpeechService;
import android.util.Log;

/**
 * What TalkBack says, as logcat lines tagged {@code HozoSpeech}.
 *
 * <p>TalkBack has no API that reports its speech, and its own logging is
 * off unless a developer setting is changed on the device. Every word it
 * speaks goes through the default text-to-speech engine, though, so an
 * engine is the one place all of it passes. This one writes each utterance
 * to the log and returns no audio -- the emulator in CI has no sound card,
 * and reading a log is more reliable than transcribing a recording.
 *
 * <p>It reports every language as available, because TalkBack falls back
 * to another engine when the default one refuses the device's locale.
 */
public class SpeechLogService extends TextToSpeechService {
    private static final String TAG = "HozoSpeech";

    private String[] language = {"eng", "USA", ""};

    @Override
    protected int onIsLanguageAvailable(String lang, String country, String variant) {
        return TextToSpeech.LANG_COUNTRY_AVAILABLE;
    }

    @Override
    protected String[] onGetLanguage() {
        return language;
    }

    @Override
    protected int onLoadLanguage(String lang, String country, String variant) {
        language = new String[] {lang, country, variant};
        return TextToSpeech.LANG_COUNTRY_AVAILABLE;
    }

    @Override
    protected void onStop() {}

    @Override
    protected void onSynthesizeText(SynthesisRequest request, SynthesisCallback callback) {
        CharSequence text = request.getCharSequenceText();
        // One line per utterance: a newline inside one would split it into
        // two log entries and two phrases.
        Log.i(TAG, text == null ? "" : text.toString().replace('\n', ' '));
        // Started and finished with no audio, so the utterance completes at
        // once and TalkBack moves on rather than waiting for playback.
        callback.start(16000, AudioFormat.ENCODING_PCM_16BIT, 1);
        callback.done();
    }
}
