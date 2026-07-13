cmake_minimum_required(VERSION 3.22.1)
project(aviation_whisper LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

set(WHISPER_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../../vendor/whisper.cpp")
if (NOT EXISTS "${WHISPER_ROOT}/CMakeLists.txt")
  message(FATAL_ERROR "whisper.cpp is missing. Run npm run callsign:setup from the mobile directory first.")
endif()

# Expo development clients invoke CMake with the Debug configuration. Whisper
# and GGML do almost all of the inference work, so optimizing only the JNI
# wrapper is not enough. Keep symbols for Java/Kotlin debugging while compiling
# the native inference targets with release-grade optimization.
set(CMAKE_C_FLAGS_DEBUG "${CMAKE_C_FLAGS_DEBUG} -O3 -DNDEBUG")
set(CMAKE_CXX_FLAGS_DEBUG "${CMAKE_CXX_FLAGS_DEBUG} -O3 -DNDEBUG")

set(AVIATION_NATIVE_OPT_FLAGS
  -O3
  -DNDEBUG
  -ffunction-sections
  -fdata-sections
)

if (ANDROID_ABI STREQUAL "arm64-v8a")
  # Initial hardware target is the Snapdragon-based ASUS ROG Phone 7.
  # This matches the optimized ARM64 strategy used by whisper.cpp's Android sample.
  list(APPEND AVIATION_NATIVE_OPT_FLAGS -march=armv8.2-a+fp16)
endif()

# Android uses GGML's internal thread pool. Avoid OpenMP oversubscription and
# other optional backends while validating the CPU-only mobile path.
set(WHISPER_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(GGML_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(GGML_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_LLAMAFILE OFF CACHE BOOL "" FORCE)

add_subdirectory("${WHISPER_ROOT}" "${CMAKE_BINARY_DIR}/whisper-build" EXCLUDE_FROM_ALL)

# Apply optimization to the actual inference libraries as well as the JNI shim.
foreach(target_name whisper ggml ggml-base ggml-cpu)
  if (TARGET ${target_name})
    target_compile_options(${target_name} PRIVATE ${AVIATION_NATIVE_OPT_FLAGS})
  endif()
endforeach()

add_library(aviation_whisper SHARED whisper_jni.cpp)

target_include_directories(aviation_whisper PRIVATE
  "${WHISPER_ROOT}/include"
  "${WHISPER_ROOT}/ggml/include"
)

find_library(log-lib log)
find_library(android-lib android)

target_link_libraries(aviation_whisper PRIVATE whisper ${log-lib} ${android-lib})
target_compile_options(aviation_whisper PRIVATE ${AVIATION_NATIVE_OPT_FLAGS})
target_link_options(aviation_whisper PRIVATE -Wl,--gc-sections)
