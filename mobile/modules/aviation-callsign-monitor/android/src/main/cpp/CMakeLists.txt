cmake_minimum_required(VERSION 3.22.1)
project(aviation_whisper LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

set(WHISPER_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../../vendor/whisper.cpp")
if (NOT EXISTS "${WHISPER_ROOT}/CMakeLists.txt")
  message(FATAL_ERROR "whisper.cpp is missing. Run npm run callsign:setup from the mobile directory first.")
endif()

set(WHISPER_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(GGML_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(GGML_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)

add_subdirectory("${WHISPER_ROOT}" "${CMAKE_BINARY_DIR}/whisper-build" EXCLUDE_FROM_ALL)

add_library(aviation_whisper SHARED whisper_jni.cpp)

target_include_directories(aviation_whisper PRIVATE
  "${WHISPER_ROOT}/include"
  "${WHISPER_ROOT}/ggml/include"
)

find_library(log-lib log)
find_library(android-lib android)

target_link_libraries(aviation_whisper PRIVATE whisper ${log-lib} ${android-lib})
target_compile_options(aviation_whisper PRIVATE -O3 -ffunction-sections -fdata-sections)
target_link_options(aviation_whisper PRIVATE -Wl,--gc-sections)
