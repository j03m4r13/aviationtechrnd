#include <jni.h>
#include <android/log.h>
#include <chrono>
#include <string>
#include <vector>

#include "whisper.h"

namespace {
constexpr const char* kLogTag = "AviationWhisper";

std::string jstring_to_string(JNIEnv* env, jstring value) {
  if (value == nullptr) return {};
  const char* chars = env->GetStringUTFChars(value, nullptr);
  std::string result(chars == nullptr ? "" : chars);
  if (chars != nullptr) env->ReleaseStringUTFChars(value, chars);
  return result;
}
}

extern "C" JNIEXPORT jlong JNICALL
Java_expo_modules_aviationcallsign_WhisperNative_nativeLoadModel(
    JNIEnv* env,
    jclass,
    jstring model_path) {
  const std::string path = jstring_to_string(env, model_path);
  __android_log_print(ANDROID_LOG_INFO, kLogTag, "Loading model: %s", path.c_str());

  whisper_context_params context_params = whisper_context_default_params();
  context_params.use_gpu = false;
  whisper_context* context = whisper_init_from_file_with_params(path.c_str(), context_params);

  __android_log_print(
      context == nullptr ? ANDROID_LOG_ERROR : ANDROID_LOG_INFO,
      kLogTag,
      "Model load %s",
      context == nullptr ? "failed" : "completed");

  return reinterpret_cast<jlong>(context);
}

extern "C" JNIEXPORT jstring JNICALL
Java_expo_modules_aviationcallsign_WhisperNative_nativeTranscribe(
    JNIEnv* env,
    jclass,
    jlong context_pointer,
    jfloatArray audio_data,
    jint threads) {
  auto* context = reinterpret_cast<whisper_context*>(context_pointer);
  if (context == nullptr || audio_data == nullptr) return env->NewStringUTF("");

  const jsize sample_count = env->GetArrayLength(audio_data);
  std::vector<float> samples(static_cast<size_t>(sample_count));
  env->GetFloatArrayRegion(audio_data, 0, sample_count, samples.data());

  __android_log_print(
      ANDROID_LOG_INFO,
      kLogTag,
      "Inference started: samples=%d threads=%d",
      static_cast<int>(sample_count),
      static_cast<int>(threads));

  const auto started_at = std::chrono::steady_clock::now();

  whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
  params.n_threads = threads;
  params.language = "en";
  params.translate = false;
  params.no_context = true;
  params.single_segment = true;
  params.print_progress = false;
  params.print_realtime = false;
  params.print_timestamps = false;
  params.print_special = false;
  params.suppress_blank = true;
  params.suppress_nst = true;
  params.temperature = 0.0f;

  const int result = whisper_full(
      context,
      params,
      samples.data(),
      static_cast<int>(samples.size()));

  const auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now() - started_at).count();

  __android_log_print(
      result == 0 ? ANDROID_LOG_INFO : ANDROID_LOG_ERROR,
      kLogTag,
      "Inference finished: result=%d elapsed_ms=%lld",
      result,
      static_cast<long long>(elapsed_ms));

  if (result != 0) return env->NewStringUTF("");

  std::string text;
  const int segment_count = whisper_full_n_segments(context);
  for (int index = 0; index < segment_count; ++index) {
    const char* segment = whisper_full_get_segment_text(context, index);
    if (segment != nullptr) {
      if (!text.empty()) text.push_back(' ');
      text.append(segment);
    }
  }

  __android_log_print(
      ANDROID_LOG_INFO,
      kLogTag,
      "Inference text length=%d segments=%d",
      static_cast<int>(text.size()),
      segment_count);

  return env->NewStringUTF(text.c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_expo_modules_aviationcallsign_WhisperNative_nativeFreeModel(
    JNIEnv*,
    jclass,
    jlong context_pointer) {
  auto* context = reinterpret_cast<whisper_context*>(context_pointer);
  if (context != nullptr) whisper_free(context);
}
