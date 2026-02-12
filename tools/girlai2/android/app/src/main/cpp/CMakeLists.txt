cmake_minimum_required(VERSION 3.10)

if(NOT DEFINED LIVE2D_SDK_ROOT)
  message(FATAL_ERROR "LIVE2D_SDK_ROOT is not set. Pass -DLIVE2D_SDK_ROOT=... from Gradle.")
endif()

set(APP_NAME girlai2_live2d)
set(SDK_ROOT_PATH ${LIVE2D_SDK_ROOT})
set(CORE_PATH ${SDK_ROOT_PATH}/Core)
set(FRAMEWORK_PATH ${SDK_ROOT_PATH}/Framework)
set(THIRD_PARTY_PATH ${SDK_ROOT_PATH}/Samples/OpenGL/thirdParty)
set(COMMON_SRC_PATH ${SDK_ROOT_PATH}/Samples/Common)
set(STB_PATH ${THIRD_PARTY_PATH}/stb)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_library(Live2DCubismCore STATIC IMPORTED)
set_target_properties(Live2DCubismCore
  PROPERTIES
    IMPORTED_LOCATION
      ${CORE_PATH}/lib/android/${ANDROID_ABI}/libLive2DCubismCore.a
    INTERFACE_INCLUDE_DIRECTORIES ${CORE_PATH}/include
)

set(FRAMEWORK_SOURCE OpenGL)
add_subdirectory(${FRAMEWORK_PATH} ${CMAKE_CURRENT_BINARY_DIR}/Framework)
target_compile_definitions(Framework PUBLIC CSM_TARGET_ANDROID_ES2)

add_library(${APP_NAME} SHARED)
add_subdirectory(${COMMON_SRC_PATH} ${CMAKE_CURRENT_BINARY_DIR}/Common)

target_sources(${APP_NAME}
  PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/JniBridgeC.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/JniBridgeC.hpp
    ${CMAKE_CURRENT_SOURCE_DIR}/LAppDefine.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/LAppDefine.hpp
    ${CMAKE_CURRENT_SOURCE_DIR}/LAppMinimumDelegate.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/LAppMinimumDelegate.hpp
    ${CMAKE_CURRENT_SOURCE_DIR}/LAppMinimumLive2DManager.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/LAppMinimumLive2DManager.hpp
    ${CMAKE_CURRENT_SOURCE_DIR}/LAppMinimumModel.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/LAppMinimumModel.hpp
    ${CMAKE_CURRENT_SOURCE_DIR}/LAppPal.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/LAppPal.hpp
    ${CMAKE_CURRENT_SOURCE_DIR}/LAppSprite.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/LAppSprite.hpp
    ${CMAKE_CURRENT_SOURCE_DIR}/LAppSpriteShader.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/LAppSpriteShader.hpp
    ${CMAKE_CURRENT_SOURCE_DIR}/LAppTextureManager.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/LAppTextureManager.hpp
    ${CMAKE_CURRENT_SOURCE_DIR}/LAppMinimumView.cpp
    ${CMAKE_CURRENT_SOURCE_DIR}/LAppMinimumView.hpp
)

target_include_directories(${APP_NAME} PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}
  ${STB_PATH}
)

target_link_libraries(${APP_NAME}
  Framework
  Live2DCubismCore
  GLESv2
  log
)

target_link_options(${APP_NAME} PRIVATE "-Wl,-z,max-page-size=16384")
