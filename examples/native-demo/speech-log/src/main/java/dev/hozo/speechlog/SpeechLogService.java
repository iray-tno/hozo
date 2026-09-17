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
        //
        // Prefixed with the UID that asked for it, because TalkBack is not
        // the only thing on the device that speaks through the default
        // engine. One run had Android's own "Service, Messages is restoring
        // backed up message content and data" arrive in the middle of the
        // walk, where it was credited to a step and counted towards the total
        // that is supposed to mean TalkBack read the screen (#470). No
        // wording tells that apart from something the app under test said --
        // the caller does.
        Log.i(
                TAG,
                request.getCallerUid()
                        + ":"
                        + (text == null ? "" : text.toString().replace('\n', ' ')));
        // Started and finished with no audio, so the utterance completes at
        // once and TalkBack moves on rather than waiting for playback.
        callback.start(16000, AudioFormat.ENCODING_PCM_16BIT, 1);
        callback.done();
    }
}
