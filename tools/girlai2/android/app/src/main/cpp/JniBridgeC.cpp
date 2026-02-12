/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

#include <jni.h>
#include <algorithm>
#include <string>
#include "JniBridgeC.hpp"
#include "LAppMinimumDelegate.hpp"
#include "LAppMinimumLive2DManager.hpp"
#include "LAppPal.hpp"

using namespace Csm;

static JavaVM* g_JVM; // JavaVM is valid for all threads, so just save it globally
static jclass  g_JniBridgeJavaClass;
static jmethodID g_LoadFileMethodId;
static jmethodID g_MoveTaskToBackMethodId;

namespace {
std::string JStringToStdString(JNIEnv* env, jstring value)
{
    if (!value)
    {
        return "";
    }

    const char* chars = env->GetStringUTFChars(value, nullptr);
    if (!chars)
    {
        return "";
    }

    std::string result(chars);
    env->ReleaseStringUTFChars(value, chars);
    return result;
}

bool EndsWith(const std::string& value, const std::string& suffix)
{
    return value.size() >= suffix.size() &&
           value.compare(value.size() - suffix.size(), suffix.size(), suffix) == 0;
}
}

JNIEnv* GetEnv()
{
    JNIEnv* env = NULL;
    g_JVM->GetEnv(reinterpret_cast<void **>(&env), JNI_VERSION_1_6);
    return env;
}

// The VM calls JNI_OnLoad when the native library is loaded
jint JNICALL JNI_OnLoad(JavaVM* vm, void* reserved)
{
    g_JVM = vm;

    JNIEnv *env;
    if (vm->GetEnv(reinterpret_cast<void **>(&env), JNI_VERSION_1_6) != JNI_OK)
    {
        return JNI_ERR;
    }

    jclass clazz = env->FindClass("com/sifstudio/girlai2/live2d/JniBridgeJava");
    g_JniBridgeJavaClass = reinterpret_cast<jclass>(env->NewGlobalRef(clazz));
    g_LoadFileMethodId = env->GetStaticMethodID(g_JniBridgeJavaClass, "LoadFile", "(Ljava/lang/String;)[B");
    g_MoveTaskToBackMethodId = env->GetStaticMethodID(g_JniBridgeJavaClass, "MoveTaskToBack", "()V");

    return JNI_VERSION_1_6;
}

void JNICALL JNI_OnUnload(JavaVM *vm, void *reserved)
{
    JNIEnv *env = GetEnv();
    env->DeleteGlobalRef(g_JniBridgeJavaClass);
}

char* JniBridgeC::LoadFileAsBytesFromJava(const char* filePath, unsigned int* outSize)
{
    JNIEnv *env = GetEnv();

    // ファイルロード
    jbyteArray obj = (jbyteArray)env->CallStaticObjectMethod(g_JniBridgeJavaClass, g_LoadFileMethodId, env->NewStringUTF(filePath));

    // ファイルが見つからなかったらnullが返ってくるためチェック
    if (!obj)
    {
        return NULL;
    }

    *outSize = static_cast<unsigned int>(env->GetArrayLength(obj));

    char* buffer = new char[*outSize];
    env->GetByteArrayRegion(obj, 0, *outSize, reinterpret_cast<jbyte *>(buffer));

    return buffer;
}

void JniBridgeC::MoveTaskToBack()
{
    JNIEnv *env = GetEnv();

    // アプリ終了
    env->CallStaticVoidMethod(g_JniBridgeJavaClass, g_MoveTaskToBackMethodId, NULL);
}

extern "C"
{
    JNIEXPORT void JNICALL
    Java_com_sifstudio_girlai2_live2d_JniBridgeJava_nativeOnStart(JNIEnv *env, jclass type)
    {
        LAppMinimumDelegate::GetInstance()->OnStart();
    }

    JNIEXPORT void JNICALL
    Java_com_sifstudio_girlai2_live2d_JniBridgeJava_nativeOnPause(JNIEnv *env, jclass type)
    {
        LAppMinimumDelegate::GetInstance()->OnPause();
    }

    JNIEXPORT void JNICALL
    Java_com_sifstudio_girlai2_live2d_JniBridgeJava_nativeOnStop(JNIEnv *env, jclass type)
    {
        LAppMinimumDelegate::GetInstance()->OnStop();
    }

    JNIEXPORT void JNICALL
    Java_com_sifstudio_girlai2_live2d_JniBridgeJava_nativeOnDestroy(JNIEnv *env, jclass type)
    {
        LAppMinimumDelegate::GetInstance()->OnDestroy();
    }

    JNIEXPORT void JNICALL
    Java_com_sifstudio_girlai2_live2d_JniBridgeJava_nativeOnSurfaceCreated(JNIEnv *env, jclass type)
    {
        LAppMinimumDelegate::GetInstance()->OnSurfaceCreate();
    }

    JNIEXPORT void JNICALL
    Java_com_sifstudio_girlai2_live2d_JniBridgeJava_nativeOnSurfaceChanged(JNIEnv *env, jclass type, jint width, jint height)
    {
        LAppMinimumDelegate::GetInstance()->OnSurfaceChanged(width, height);
    }

    JNIEXPORT void JNICALL
    Java_com_sifstudio_girlai2_live2d_JniBridgeJava_nativeOnDrawFrame(JNIEnv *env, jclass type)
    {
        LAppMinimumDelegate::GetInstance()->Run();
    }

    JNIEXPORT void JNICALL
    Java_com_sifstudio_girlai2_live2d_JniBridgeJava_nativeOnTouchesBegan(JNIEnv *env, jclass type, jfloat pointX, jfloat pointY)
    {
        LAppMinimumDelegate::GetInstance()->OnTouchBegan(pointX, pointY);
    }

    JNIEXPORT void JNICALL
    Java_com_sifstudio_girlai2_live2d_JniBridgeJava_nativeOnTouchesEnded(JNIEnv *env, jclass type, jfloat pointX, jfloat pointY)
    {
        LAppMinimumDelegate::GetInstance()->OnTouchEnded(pointX, pointY);
    }

    JNIEXPORT void JNICALL
    Java_com_sifstudio_girlai2_live2d_JniBridgeJava_nativeOnTouchesMoved(JNIEnv *env, jclass type, jfloat pointX, jfloat pointY)
    {
        LAppMinimumDelegate::GetInstance()->OnTouchMoved(pointX, pointY);
    }

    JNIEXPORT void JNICALL
    Java_com_sifstudio_girlai2_live2d_JniBridgeJava_nativeLoadModel(JNIEnv *env, jclass type, jstring modelJsonPath)
    {
        std::string path = JStringToStdString(env, modelJsonPath);
        std::replace(path.begin(), path.end(), '\\', '/');

        const std::string suffix = ".model3.json";
        std::string basePath = path;
        if (EndsWith(path, suffix))
        {
            basePath = path.substr(0, path.size() - suffix.size());
        }

        const std::size_t slash = basePath.find_last_of('/');
        if (slash == std::string::npos)
        {
            return;
        }

        const std::string modelDirectory = basePath.substr(0, slash);
        const std::string modelName = basePath.substr(slash + 1);
        if (modelDirectory.empty() || modelName.empty())
        {
            return;
        }

        LAppMinimumLive2DManager::GetInstance()->LoadModel(modelDirectory, modelName);
    }

    JNIEXPORT void JNICALL
    Java_com_sifstudio_girlai2_live2d_JniBridgeJava_nativeSetExpression(JNIEnv *env, jclass type, jstring expressionName)
    {
        std::string expression = JStringToStdString(env, expressionName);
        if (expression.empty() || expression == "Neutral")
        {
            LAppMinimumLive2DManager::GetInstance()->ClearExpression();
            return;
        }

        LAppMinimumLive2DManager::GetInstance()->SetExpression(expression);
    }

    JNIEXPORT void JNICALL
    Java_com_sifstudio_girlai2_live2d_JniBridgeJava_nativeSetParameter(JNIEnv *env, jclass type, jstring parameterId, jfloat value)
    {
        std::string parameter = JStringToStdString(env, parameterId);
        if (parameter.empty())
        {
            return;
        }
        LAppMinimumLive2DManager::GetInstance()->SetParameter(parameter, value);
    }
}
