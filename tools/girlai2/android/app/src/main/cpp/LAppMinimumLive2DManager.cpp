/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

#include "LAppMinimumLive2DManager.hpp"
#include <cmath>
#include <string>
#include <GLES2/gl2.h>
#include <Rendering/CubismRenderer.hpp>
#include "LAppPal.hpp"
#include "LAppDefine.hpp"
#include "LAppMinimumDelegate.hpp"
#include "LAppMinimumModel.hpp"
#include "LAppMinimumView.hpp"

using namespace Csm;
using namespace LAppDefine;
using namespace std;

namespace {
    LAppMinimumLive2DManager* s_instance = nullptr;
}

LAppMinimumLive2DManager* LAppMinimumLive2DManager::GetInstance()
{
    if (!s_instance)
    {
        s_instance = new LAppMinimumLive2DManager();
    }

    return s_instance;
}

void LAppMinimumLive2DManager::ReleaseInstance()
{
    if (s_instance)
    {
        delete s_instance;
    }

    s_instance = nullptr;
}

LAppMinimumLive2DManager::LAppMinimumLive2DManager()
{
    _viewMatrix = new CubismMatrix44();
    _model = nullptr;
    _viewScale = 1.0f;
    _viewOffsetX = 0.0f;
    _viewOffsetY = 0.0f;
}

LAppMinimumLive2DManager::~LAppMinimumLive2DManager()
{
    ReleaseModel();
    delete _viewMatrix;
}

void LAppMinimumLive2DManager::ReleaseModel()
{
    if (_model)
    {
        delete _model;
        _model = nullptr;
    }
}

LAppMinimumModel* LAppMinimumLive2DManager::GetModel() const
{
    return _model;
}

void LAppMinimumLive2DManager::OnDrag(csmFloat32 x, csmFloat32 y) const
{
    LAppMinimumModel* model = GetModel();
    if (!model)
    {
        return;
    }
    model->SetDragging(x, y);
}

void LAppMinimumLive2DManager::OnUpdate() const
{
    LAppMinimumModel* model = GetModel();
    if (!model)
    {
        return;
    }

    int width = LAppMinimumDelegate::GetInstance()->GetWindowWidth();
    int height = LAppMinimumDelegate::GetInstance()->GetWindowHeight();
    if (width <= 0 || height <= 0)
    {
        return;
    }

    auto* cubismModel = model->GetModel();
    if (!cubismModel)
    {
        return;
    }

    auto* view = LAppMinimumDelegate::GetInstance()->GetView();
    if (!view)
    {
        return;
    }

    CubismMatrix44 projection;

    if (cubismModel->GetCanvasWidth() > 1.0f && width < height)
    {
        // 横に長いモデルを縦長ウィンドウに表示する際モデルの横サイズでscaleを算出する
        model->GetModelMatrix()->SetWidth(2.0f);
        projection.Scale(1.0f, static_cast<float>(width) / static_cast<float>(height));
    }
    else
    {
        projection.Scale(static_cast<float>(height) / static_cast<float>(width), 1.0f);
    }

    if (_viewMatrix)
    {
        _viewMatrix->LoadIdentity();
        _viewMatrix->Scale(_viewScale, _viewScale);
        _viewMatrix->TranslateRelative(_viewOffsetX, _viewOffsetY);
        projection.MultiplyByMatrix(_viewMatrix);
    }

    // Keep framing anchored. Whole-model bob/zoom created visible drifting
    // during chat and typing.

    // モデル1体描画前コール
    view->PreModelDraw(*model);

    model->Update();
    model->Draw(projection);///< 参照渡しなのでprojectionは変質する

    // モデル1体描画前コール
    view->PostModelDraw(*model);
}

void LAppMinimumLive2DManager::SetAssetDirectory(const std::string &path)
{
    _currentModelDirectory = path;
}

void LAppMinimumLive2DManager::LoadModel(const std::string& modelDirectoryName, const std::string& modelName)
{
    _modelDirectoryName = modelDirectoryName;
    _modelName = modelName;

    ReleaseModel();

    // モデルのディレクトリを指定
    SetAssetDirectory(LAppDefine::ResourcesPath + modelDirectoryName + "/");

    // モデルデータの新規生成
    _model = new LAppMinimumModel(modelName, _currentModelDirectory);

    // モデルデータの読み込み及び生成とセットアップを行う
    static_cast<LAppMinimumModel*>(_model)->SetupModel();
}

void LAppMinimumLive2DManager::SetExpression(const std::string& expressionName) const
{
    LAppMinimumModel* model = GetModel();
    if (!model)
    {
        return;
    }
    model->SetExpression(expressionName.c_str());
}

void LAppMinimumLive2DManager::ClearExpression() const
{
    LAppMinimumModel* model = GetModel();
    if (!model)
    {
        return;
    }
    model->ClearExpression();
}

void LAppMinimumLive2DManager::SetParameter(const std::string& parameterId, csmFloat32 value) const
{
    LAppMinimumModel* model = GetModel();
    if (!model)
    {
        return;
    }
    model->SetParameterOverride(parameterId, value);
}

void LAppMinimumLive2DManager::ClearParameter(const std::string& parameterId) const
{
    LAppMinimumModel* model = GetModel();
    if (!model)
    {
        return;
    }
    model->ClearParameterOverride(parameterId);
}

void LAppMinimumLive2DManager::SetViewTransform(
    csmFloat32 scale,
    csmFloat32 offsetX,
    csmFloat32 offsetY)
{
    _viewScale = scale;
    _viewOffsetX = offsetX;
    _viewOffsetY = offsetY;
}
