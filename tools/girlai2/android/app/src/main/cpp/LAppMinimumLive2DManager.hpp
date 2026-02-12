/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

#pragma once

#include <CubismFramework.hpp>
#include <Math/CubismMatrix44.hpp>
#include <Type/csmVector.hpp>
#include <string>

class LAppMinimumModel;

/**
* @brief サンプルアプリケーションにおいてCubismModelを管理するクラス<br>
*         モデル生成と破棄、タップイベントの処理、モデル切り替えを行う。
*
*/
class LAppMinimumLive2DManager
{

public:
    /**
    * @brief   クラスのインスタンス（シングルトン）を返す。<br>
    *           インスタンスが生成されていない場合は内部でインスタンを生成する。
    *
    * @return  クラスのインスタンス
    */
    static LAppMinimumLive2DManager* GetInstance();

    /**
    * @brief   クラスのインスタンス（シングルトン）を解放する。
    *
    */
    static void ReleaseInstance();

    /**
    * @brief   現在のシーンで保持しているモデルを返す
    *
    * @return      モデルのインスタンスを返す。
    */
    LAppMinimumModel* GetModel() const;

    /**
    * @brief   現在のシーンで保持しているすべてのモデルを解放する
    *
    */
    void ReleaseModel();

    /**
    * @brief   画面をドラッグしたときの処理
    *
    * @param[in]   x   画面のX座標
    * @param[in]   y   画面のY座標
    */
    void OnDrag(Csm::csmFloat32 x, Csm::csmFloat32 y) const;

    /**
    * @brief   画面を更新するときの処理
    *          モデルの更新処理および描画処理を行う
    */
    void OnUpdate() const;

    /**
    * @brief   Load a model from an asset directory and model name.
    *
    * @param[in]   modelDirectoryName  Directory inside assets containing model data.
    * @param[in]   modelName           Model base name used by `<name>.model3.json`.
    */
    void LoadModel(const std::string& modelDirectoryName, const std::string& modelName);

    /**
    * @brief   Apply expression by expression name.
    */
    void SetExpression(const std::string& expressionName) const;

    /**
    * @brief   Clear any active expression motion.
    */
    void ClearExpression() const;

    /**
    * @brief   Override model parameter value by parameter id.
    */
    void SetParameter(const std::string& parameterId, Csm::csmFloat32 value) const;

private:
    /**
    * @brief  コンストラクタ
    */
    LAppMinimumLive2DManager();

    /**
    * @brief  デストラクタ
    */
    virtual ~LAppMinimumLive2DManager();

    /**
    * @brief ディレクトリパスの設定
    *
    * モデルのディレクトリパスを設定する
    */
    void SetAssetDirectory(const std::string& path);

    Csm::CubismMatrix44*        _viewMatrix; ///< モデル描画に用いるView行列
    LAppMinimumModel*  _model; ///< モデルインスタンス

    std::string _modelDirectoryName; ///< Current model directory name.
    std::string _modelName; ///< Current model base filename without extension.
    std::string _currentModelDirectory; ///< 現在のモデルのディレクトリ
};
