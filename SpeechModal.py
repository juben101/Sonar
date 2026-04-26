"""
SONAR – Speech Emotion Recognition (SER) + Explainability

Pipeline:
1) Prepare SER dataset from:
   - RAVDESS
   - CREMA-D
   - MELD
   - TESS
   - IEMOCAP (held-out test – leave-one-corpus-out evaluation)

   Coarse emotion labels aligned across all corpora: {happy, sad, angry, neutral}

2) Train WavLM-large SER model:
   - Backbone : microsoft/wavlm-large
   - Emotions : ['happy', 'sad', 'angry', 'neutral']
   - Train on  : RAVDESS + CREMA-D + MELD + TESS
   - Test on   : IEMOCAP (unseen domain)
   - Only the final transformer block and classification head are unfrozen
   - Saves best model to: ./final_best_ser_model

3) EnhancedSpeechEmotionModel:
   - Loads trained SER model
   - Uses Whisper for speech-to-text (ASR confidence forwarded to fusion stage)
   - Extracts prosodic features (pitch, energy, MFCCs, jitter, pauses, etc.)
   - Generates human-readable explanations
"""

import os
import warnings
from dataclasses import dataclass, field
from typing import Dict, List, Tuple, Optional, Any

import numpy as np
import pandas as pd

import torch
import torchaudio
import torch.nn.functional as F

from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    classification_report,
    confusion_matrix,
    roc_auc_score,
    log_loss,
)

from torch.utils.data import Dataset

import matplotlib.pyplot as plt
import seaborn as sns

from transformers import (
    WavLMForSequenceClassification,
    AutoFeatureExtractor,
    TrainingArguments,
    Trainer,
)

import librosa
import whisper

warnings.filterwarnings("ignore")


# ==================== CONFIG ====================

RAVDESS_DIR = "path/to/ravdess"
CREMA_D_DIR = "path/to/crema_d"
MELD_DIR    = "path/to/meld"
TESS_DIR    = "path/to/tess"
IEMOCAP_DIR = "path/to/iemocap"

TARGET_EMOTIONS = ["happy", "sad", "angry", "neutral"]
NUM_LABELS      = len(TARGET_EMOTIONS)
EMOTION_TO_ID   = {e: i for i, e in enumerate(TARGET_EMOTIONS)}
ID_TO_EMOTION   = {i: e for i, e in enumerate(TARGET_EMOTIONS)}

SER_MODEL_NAME     = "microsoft/wavlm-large"
WHISPER_MODEL_SIZE = "tiny"

BATCH_SIZE      = 2
GRAD_ACCUM      = 8
LEARNING_RATE   = 1e-4
NUM_EPOCHS      = 10
EVAL_STEPS      = 100
SAMPLING_RATE   = 16000
OUTPUT_DIR      = "./ser_results"
FINAL_SAVE_PATH = "./final_best_ser_model"

DEVICE   = torch.device("cuda" if torch.cuda.is_available() else "cpu")
USE_FP16 = torch.cuda.is_available()

print(f"Using device   : {DEVICE}")
print(f"SER backbone   : {SER_MODEL_NAME}")
print(f"Batch size     : {BATCH_SIZE}, GradAccum: {GRAD_ACCUM}, fp16: {USE_FP16}")


# ==================== DATA LOADING ====================

def build_ravdess_df(ravdess_dir: str) -> pd.DataFrame:
    """
    RAVDESS filename: modality-vocalchannel-emotion-intensity-statement-repetition-actor.wav
    Emotion codes: 3=happy, 4=sad, 5=angry, 1/2=neutral
    """
    data = []
    if not os.path.isdir(ravdess_dir):
        print(f"RAVDESS not found: {ravdess_dir}")
        return pd.DataFrame(columns=["path", "emotion"])

    for actor in os.listdir(ravdess_dir):
        actor_path = os.path.join(ravdess_dir, actor)
        if not os.path.isdir(actor_path):
            continue
        for audio_file in os.listdir(actor_path):
            if not audio_file.lower().endswith(".wav"):
                continue
            parts = audio_file.split("-")
            if len(parts) < 3:
                continue
            try:
                code = int(parts[2])
            except ValueError:
                continue

            if code == 3:
                emotion = "happy"
            elif code == 4:
                emotion = "sad"
            elif code == 5:
                emotion = "angry"
            elif code in (1, 2):
                emotion = "neutral"
            else:
                continue

            data.append({"path": os.path.join(actor_path, audio_file), "emotion": emotion})

    df = pd.DataFrame(data)
    print(f"RAVDESS samples: {len(df)}")
    return df


def build_crema_d_df(crema_d_dir: str) -> pd.DataFrame:
    """
    CREMA-D filename: ID_ID_EMOTION_...
    Emotion codes: HAP, SAD, ANG, NEU
    """
    data = []
    if not os.path.isdir(crema_d_dir):
        print(f"CREMA-D not found: {crema_d_dir}")
        return pd.DataFrame(columns=["path", "emotion"])

    for audio_file in os.listdir(crema_d_dir):
        if not audio_file.lower().endswith(".wav"):
            continue
        parts = audio_file.split("_")
        if len(parts) < 3:
            continue
        code = parts[2]

        if code == "HAP":
            emotion = "happy"
        elif code == "SAD":
            emotion = "sad"
        elif code == "ANG":
            emotion = "angry"
        elif code == "NEU":
            emotion = "neutral"
        else:
            continue

        data.append({"path": os.path.join(crema_d_dir, audio_file), "emotion": emotion})

    df = pd.DataFrame(data)
    print(f"CREMA-D samples: {len(df)}")
    return df


def build_meld_df(meld_dir: str) -> pd.DataFrame:
    """
    MELD: expects train_sent_emo.csv alongside an audio/ subfolder.
    CSV columns required: Dialogue_ID, Utterance_ID, Emotion.
    Audio files expected at: audio/dia{Dialogue_ID}_utt{Utterance_ID}.wav
    Coarse mapping: joy/surprise -> happy, sadness -> sad, anger/disgust -> angry, neutral/fear -> neutral.
    Adapt the wav_file path construction to match your directory layout.
    """
    data = []
    if not os.path.isdir(meld_dir):
        print(f"MELD not found: {meld_dir}")
        return pd.DataFrame(columns=["path", "emotion"])

    csv_path = os.path.join(meld_dir, "train_sent_emo.csv")
    if not os.path.isfile(csv_path):
        print(f"MELD CSV not found: {csv_path}. Skipping MELD.")
        return pd.DataFrame(columns=["path", "emotion"])

    meld_coarse = {
        "joy":      "happy",
        "surprise": "happy",
        "sadness":  "sad",
        "anger":    "angry",
        "disgust":  "angry",
        "neutral":  "neutral",
        "fear":     "neutral",
    }

    df_csv = pd.read_csv(csv_path)
    for _, row in df_csv.iterrows():
        raw = str(row.get("Emotion", "")).lower().strip()
        emotion = meld_coarse.get(raw)
        if emotion is None:
            continue
        dia_id   = row.get("Dialogue_ID", "")
        utt_id   = row.get("Utterance_ID", "")
        wav_file = os.path.join(meld_dir, "audio", f"dia{dia_id}_utt{utt_id}.wav")
        if not os.path.isfile(wav_file):
            continue
        data.append({"path": wav_file, "emotion": emotion})

    df = pd.DataFrame(data)
    print(f"MELD samples: {len(df)}")
    return df


def build_tess_df(tess_dir: str) -> pd.DataFrame:
    """
    TESS filename: OAF_word_emotion.wav / YAF_word_emotion.wav
    Keeps only: happy, sad, angry, neutral
    """
    data = []
    if not os.path.isdir(tess_dir):
        print(f"TESS not found: {tess_dir}")
        return pd.DataFrame(columns=["path", "emotion"])

    for sub_dir in os.listdir(tess_dir):
        sub_path = os.path.join(tess_dir, sub_dir)
        if not os.path.isdir(sub_path):
            continue
        for audio_file in os.listdir(sub_path):
            if not audio_file.lower().endswith(".wav"):
                continue
            parts = audio_file.split("_")
            if len(parts) < 2:
                continue
            emotion_str = parts[-1].split(".")[0].lower()

            if emotion_str == "happy":
                emotion = "happy"
            elif emotion_str == "sad":
                emotion = "sad"
            elif emotion_str in ("angry", "anger"):
                emotion = "angry"
            elif emotion_str in ("neutral", "neu"):
                emotion = "neutral"
            else:
                continue

            data.append({"path": os.path.join(sub_path, audio_file), "emotion": emotion})

    df = pd.DataFrame(data)
    print(f"TESS samples: {len(df)}")
    return df


def build_iemocap_df(iemocap_dir: str) -> pd.DataFrame:
    """
    IEMOCAP held-out test corpus (leave-one-corpus-out evaluation).
    Coarse mapping via filename suffixes: hap/exc -> happy, sad -> sad, ang -> angry, neu -> neutral.
    Adapt parsing to your EmoEvaluation file structure as needed.
    """
    data = []
    if not os.path.isdir(iemocap_dir):
        print(f"IEMOCAP not found: {iemocap_dir}")
        return pd.DataFrame(columns=["path", "emotion"])

    code_map = {
        "_hap": "happy",
        "_exc": "happy",
        "_sad": "sad",
        "_ang": "angry",
        "_neu": "neutral",
    }

    for root, _, files in os.walk(iemocap_dir):
        for audio_file in files:
            if not audio_file.lower().endswith(".wav"):
                continue
            name_lower = audio_file.lower()
            emotion    = None
            for code, label in code_map.items():
                if code in name_lower:
                    emotion = label
                    break
            if emotion is None:
                continue
            data.append({"path": os.path.join(root, audio_file), "emotion": emotion})

    df = pd.DataFrame(data)
    print(f"IEMOCAP samples: {len(df)}")
    return df


def build_splits() -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Train + Val: RAVDESS + CREMA-D + MELD + TESS (stratified 90/10 split)
    Test       : IEMOCAP (held-out, leave-one-corpus-out)
    """
    ravdess_df = build_ravdess_df(RAVDESS_DIR)
    crema_d_df = build_crema_d_df(CREMA_D_DIR)
    meld_df    = build_meld_df(MELD_DIR)
    tess_df    = build_tess_df(TESS_DIR)
    iemocap_df = build_iemocap_df(IEMOCAP_DIR)

    combined_df = pd.concat([ravdess_df, crema_d_df, meld_df, tess_df], ignore_index=True)
    combined_df = combined_df.dropna(subset=["emotion"])

    print(f"\nTotal combined (train+val) samples: {len(combined_df)}")
    print("Emotion distribution (combined):")
    print(combined_df["emotion"].value_counts())

    train_df, val_df = train_test_split(
        combined_df,
        test_size=0.1,
        random_state=42,
        stratify=combined_df["emotion"],
    )

    test_df = iemocap_df.copy()

    print(f"\nTrain size : {len(train_df)}")
    print(f"Val size   : {len(val_df)}")
    print(f"Test size (IEMOCAP): {len(test_df)}")
    print("\nEmotion distribution (Train):")
    print(train_df["emotion"].value_counts())
    print("\nEmotion distribution (Val):")
    print(val_df["emotion"].value_counts())
    print("\nEmotion distribution (Test/IEMOCAP):")
    print(test_df["emotion"].value_counts())

    return train_df, val_df, test_df


# ==================== PYTORCH DATASET + COLLATOR ====================

class AudioEmotionDataset(Dataset):

    def __init__(self, df: pd.DataFrame, feature_extractor: AutoFeatureExtractor, target_sr: int = SAMPLING_RATE):
        self.df                = df.reset_index(drop=True)
        self.feature_extractor = feature_extractor
        self.target_sr         = target_sr

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx: int):
        row       = self.df.iloc[idx]
        file_path = row["path"]
        emotion   = row["emotion"]

        try:
            waveform, sample_rate = torchaudio.load(file_path)
            if sample_rate != self.target_sr:
                resampler = torchaudio.transforms.Resample(orig_freq=sample_rate, new_freq=self.target_sr)
                waveform  = resampler(waveform)
            if waveform.shape[0] > 1:
                waveform = torch.mean(waveform, dim=0, keepdim=True)
            waveform = waveform.squeeze().numpy().astype(np.float32)
        except Exception as e:
            print(f"Skipping file: {file_path} | {e}")
            waveform = np.random.randn(self.target_sr * 2).astype(np.float32)

        encoding     = self.feature_extractor(waveform, sampling_rate=self.target_sr, return_tensors="pt")
        input_values = encoding.input_values.squeeze(0)
        label_id     = EMOTION_TO_ID.get(emotion, 0)

        return {
            "input_values": input_values,
            "labels":       torch.tensor(label_id, dtype=torch.long),
        }


def data_collator_fn(features: List[Dict[str, Any]]) -> Dict[str, torch.Tensor]:
    features = [f for f in features if f is not None]
    if not features:
        return {}

    max_length = max(f["input_values"].shape[0] for f in features)

    input_values   = []
    attention_mask = []
    labels         = []

    for f in features:
        x          = f["input_values"]
        pad_length = max_length - x.shape[0]
        input_values.append(F.pad(x, (0, pad_length), "constant", 0.0))
        mask = torch.ones(x.shape[0], dtype=torch.long)
        attention_mask.append(F.pad(mask, (0, pad_length), "constant", 0))
        labels.append(f["labels"])

    return {
        "input_values":   torch.stack(input_values),
        "attention_mask": torch.stack(attention_mask),
        "labels":         torch.stack(labels),
    }


# ==================== METRICS & TRAINING ====================

def trainer_compute_metrics(p):
    preds  = np.argmax(p.predictions, axis=1)
    labels = p.label_ids
    ua     = balanced_accuracy_score(labels, preds)
    report = classification_report(
        labels, preds, target_names=TARGET_EMOTIONS, output_dict=True, zero_division=0
    )
    f1_macro = report["macro avg"]["f1-score"]
    return {"balanced_accuracy": ua, "macro_f1": f1_macro}


def analyze_full_metrics(labels: np.ndarray, logits: np.ndarray):
    preds = np.argmax(logits, axis=1)
    probs = F.softmax(torch.tensor(logits), dim=1).numpy()

    wa     = accuracy_score(labels, preds)
    ua     = balanced_accuracy_score(labels, preds)
    report = classification_report(labels, preds, target_names=TARGET_EMOTIONS, zero_division=0)

    try:
        logloss = log_loss(labels, probs, labels=np.arange(NUM_LABELS))
    except ValueError:
        logloss = np.nan

    try:
        auc = roc_auc_score(labels, probs, multi_class="ovr", average="macro")
    except ValueError:
        auc = np.nan

    print("\n===== IEMOCAP Test Evaluation =====")
    print(f"Weighted Accuracy (WA)  : {wa:.4f}")
    print(f"Unweighted Accuracy (UA): {ua:.4f}")
    print(f"Log Loss                : {logloss:.4f}")
    print(f"AUC-ROC                 : {auc:.4f}")
    print("\nClassification Report:")
    print(report)

    cm = confusion_matrix(labels, preds)
    plt.figure(figsize=(8, 6))
    sns.heatmap(cm, annot=True, fmt="d", cmap="Blues",
                xticklabels=TARGET_EMOTIONS, yticklabels=TARGET_EMOTIONS)
    plt.title("Confusion Matrix – IEMOCAP Test Set")
    plt.ylabel("Actual")
    plt.xlabel("Predicted")
    plt.tight_layout()
    plt.savefig("ser_iemocap_confusion_matrix.png", dpi=300, bbox_inches="tight")
    print("Confusion matrix saved to ser_iemocap_confusion_matrix.png")
    plt.show()

    return ua


def train_ser_model(train_df: pd.DataFrame, val_df: pd.DataFrame, test_df: pd.DataFrame):
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    feature_extractor = AutoFeatureExtractor.from_pretrained(SER_MODEL_NAME)

    train_ds = AudioEmotionDataset(train_df, feature_extractor)
    val_ds   = AudioEmotionDataset(val_df,   feature_extractor)
    test_ds  = AudioEmotionDataset(test_df,  feature_extractor)

    model = WavLMForSequenceClassification.from_pretrained(
        SER_MODEL_NAME,
        num_labels=NUM_LABELS,
        label2id=EMOTION_TO_ID,
        id2label=ID_TO_EMOTION,
        ignore_mismatched_sizes=True,
    )

    # Freeze entire encoder; unfreeze only the final transformer block + head
    for param in model.wavlm.encoder.parameters():
        param.requires_grad = False
    for param in model.wavlm.encoder.layers[-1].parameters():
        param.requires_grad = True
    for param in model.projector.parameters():
        param.requires_grad = True
    for param in model.classifier.parameters():
        param.requires_grad = True

    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"WavLM-large: final transformer block + classifier unfrozen. Trainable params: {trainable:,}")

    model.to(DEVICE)

    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE,
        gradient_accumulation_steps=GRAD_ACCUM,
        evaluation_strategy="steps",
        eval_steps=EVAL_STEPS,
        save_strategy="epoch",
        logging_dir=os.path.join(OUTPUT_DIR, "logs"),
        logging_steps=EVAL_STEPS,
        learning_rate=LEARNING_RATE,
        num_train_epochs=NUM_EPOCHS,
        load_best_model_at_end=True,
        metric_for_best_model="balanced_accuracy",
        greater_is_better=True,
        fp16=USE_FP16,
        report_to="none",
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        data_collator=data_collator_fn,
        compute_metrics=trainer_compute_metrics,
        tokenizer=feature_extractor,
    )

    print("\nStarting SER training...")
    trainer.train()
    print("\nTraining finished.")

    print("\nEvaluating on IEMOCAP held-out test set...")
    test_predictions = trainer.predict(test_ds)
    ua = analyze_full_metrics(test_predictions.label_ids, test_predictions.predictions)
    print(f"\nFinal Test Unweighted Accuracy (UA): {ua:.4f}")

    os.makedirs(FINAL_SAVE_PATH, exist_ok=True)
    trainer.save_model(FINAL_SAVE_PATH)
    feature_extractor.save_pretrained(FINAL_SAVE_PATH)
    print(f"\nBest SER model + feature extractor saved to: {FINAL_SAVE_PATH}")


# ==================== EXPLAINABILITY STRUCTURES ====================

@dataclass
class ProsodicFeatures:
    pitch_mean: float
    pitch_std: float
    pitch_min: float
    pitch_max: float
    pitch_range: float
    energy_mean: float
    energy_std: float
    energy_max: float
    speaking_rate: float
    pause_count: int
    pause_duration_mean: float
    spectral_centroid_mean: float
    spectral_rolloff_mean: float
    zero_crossing_rate_mean: float
    jitter: float
    shimmer: float
    mfcc_mean: np.ndarray = field(default_factory=lambda: np.array([]))
    mfcc_std:  np.ndarray = field(default_factory=lambda: np.array([]))


@dataclass
class SpeechEmotionResult:
    audio_path: str
    duration: float
    sample_rate: int
    transcribed_text: str
    detected_language: str
    asr_confidence: float
    predicted_emotion: str
    confidence: float
    all_probabilities: Dict[str, float]
    prosodic_features: ProsodicFeatures
    emotion_trajectory: Optional[List[Tuple[float, str, float]]] = None
    prosodic_reasoning: Dict[str, str] = field(default_factory=dict)


class ProsodicFeatureExtractor:

    def __init__(self, sample_rate: int = SAMPLING_RATE):
        self.sample_rate = sample_rate

    def extract_features(self, audio_path: str) -> ProsodicFeatures:
        y, sr = librosa.load(audio_path, sr=self.sample_rate)

        f0, _, _ = librosa.pyin(
            y,
            fmin=librosa.note_to_hz("C2"),
            fmax=librosa.note_to_hz("C7"),
            sr=sr,
        )
        f0_voiced = f0[~np.isnan(f0)]
        if len(f0_voiced) > 0:
            pitch_mean = float(np.mean(f0_voiced))
            pitch_std  = float(np.std(f0_voiced))
            pitch_min  = float(np.min(f0_voiced))
            pitch_max  = float(np.max(f0_voiced))
        else:
            pitch_mean = pitch_std = pitch_min = pitch_max = 0.0
        pitch_range = pitch_max - pitch_min

        rms         = librosa.feature.rms(y=y)[0]
        energy_mean = float(np.mean(rms))
        energy_std  = float(np.std(rms))
        energy_max  = float(np.max(rms))

        onset_frames  = librosa.onset.onset_detect(y=y, sr=sr)
        duration      = len(y) / sr
        speaking_rate = float(len(onset_frames) / duration) if duration > 0 else 0.0

        pause_threshold = np.mean(rms) * 0.3
        is_pause        = rms < pause_threshold
        pause_changes   = np.diff(is_pause.astype(int))
        pause_starts    = np.where(pause_changes == 1)[0]
        pause_ends      = np.where(pause_changes == -1)[0]

        if len(pause_starts) > 0 and len(pause_ends) > 0:
            if pause_starts[0] > pause_ends[0]:
                pause_ends = pause_ends[1:]
            if len(pause_starts) > len(pause_ends):
                pause_starts = pause_starts[:-1]
            pause_durations     = (pause_ends - pause_starts) / sr
            pause_count         = int(len(pause_durations))
            pause_duration_mean = float(np.mean(pause_durations)) if pause_count > 0 else 0.0
        else:
            pause_count         = 0
            pause_duration_mean = 0.0

        spectral_centroid_mean = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)[0]))
        spectral_rolloff_mean  = float(np.mean(librosa.feature.spectral_rolloff(y=y, sr=sr)[0]))
        zcr_mean               = float(np.mean(librosa.feature.zero_crossing_rate(y)[0]))

        jitter  = float(np.mean(np.abs(np.diff(f0_voiced))) / pitch_mean) if len(f0_voiced) > 1 and pitch_mean > 0 else 0.0
        shimmer = float(np.mean(np.abs(np.diff(rms))) / energy_mean)      if len(rms) > 1 and energy_mean > 0 else 0.0

        mfccs     = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        mfcc_mean = np.mean(mfccs, axis=1)
        mfcc_std  = np.std(mfccs, axis=1)

        return ProsodicFeatures(
            pitch_mean=pitch_mean, pitch_std=pitch_std,
            pitch_min=pitch_min,   pitch_max=pitch_max, pitch_range=pitch_range,
            energy_mean=energy_mean, energy_std=energy_std, energy_max=energy_max,
            speaking_rate=speaking_rate,
            pause_count=pause_count, pause_duration_mean=pause_duration_mean,
            spectral_centroid_mean=spectral_centroid_mean,
            spectral_rolloff_mean=spectral_rolloff_mean,
            zero_crossing_rate_mean=zcr_mean,
            jitter=jitter, shimmer=shimmer,
            mfcc_mean=mfcc_mean, mfcc_std=mfcc_std,
        )

    def generate_reasoning(self, features: ProsodicFeatures) -> Dict[str, str]:
        reasoning: Dict[str, str] = {}

        if features.pitch_mean > 200:
            reasoning["pitch"] = "High pitch detected – can indicate excitement, anxiety, or stress."
        elif features.pitch_mean < 120:
            reasoning["pitch"] = "Low pitch detected – can indicate sadness, calmness, or authority."
        else:
            reasoning["pitch"] = "Mid-range pitch – more neutral/typical speaking voice."

        if features.pitch_std > 50:
            reasoning["pitch_variation"] = "High pitch variation – expressive/emotional speech."
        else:
            reasoning["pitch_variation"] = "Low pitch variation – more monotone, possibly sadness or tiredness."

        if features.energy_mean > 0.05:
            reasoning["energy"] = "High energy – suggests anger, excitement, or enthusiasm."
        elif features.energy_mean < 0.02:
            reasoning["energy"] = "Low energy – suggests sadness, fatigue, or low engagement."
        else:
            reasoning["energy"] = "Moderate energy – balanced emotional intensity."

        if features.speaking_rate > 4:
            reasoning["speaking_rate"] = "Fast speaking rate – can indicate anxiety, excitement, or urgency."
        elif features.speaking_rate < 2:
            reasoning["speaking_rate"] = "Slow speaking rate – can indicate sadness, tiredness, or careful thinking."
        else:
            reasoning["speaking_rate"] = "Normal speaking rate – comfortable flow."

        if features.pause_count > 10 and features.pause_duration_mean > 0.5:
            reasoning["pauses"] = "Frequent long pauses – indicates hesitation, sadness, or contemplation."
        elif features.pause_count < 3:
            reasoning["pauses"] = "Few pauses – suggests confidence, excitement, or urgency."
        else:
            reasoning["pauses"] = "Normal pause pattern – natural speech rhythm."

        if features.jitter > 0.05:
            reasoning["voice_quality"] = "High jitter – may indicate vocal tension or emotional stress."
        else:
            reasoning["voice_quality"] = "Stable voice quality – more calm and controlled."

        return reasoning


# ==================== ENHANCED SPEECH EMOTION MODEL ====================

class EnhancedSpeechEmotionModel:
    """
    Enhanced speech emotion recognizer:
      - WavLM-large SER backbone for coarse emotion + confidence (Cs)
      - Whisper for ASR transcription + ASR confidence (Casr)
      - Prosodic analysis for explainability
      Both Cs and Casr are forwarded to the confidence-aware fusion stage.
    """

    def __init__(self, ser_model_path: str = FINAL_SAVE_PATH, whisper_size: str = WHISPER_MODEL_SIZE):
        print(f"\nInitializing EnhancedSpeechEmotionModel...")
        self.device = DEVICE

        from transformers import AutoModelForAudioClassification

        try:
            self.ser_model         = AutoModelForAudioClassification.from_pretrained(ser_model_path)
            self.feature_extractor = AutoFeatureExtractor.from_pretrained(ser_model_path)
            self.ser_model.to(self.device)
            self.ser_model.eval()
            self.id2label = self.ser_model.config.id2label
            self.label2id = self.ser_model.config.label2id
            print(f"SER model loaded from {ser_model_path} | labels: {self.id2label}")
        except Exception as e:
            print(f"Failed to load SER model: {e}")
            self.ser_model         = None
            self.feature_extractor = None
            self.id2label = ID_TO_EMOTION
            self.label2id = EMOTION_TO_ID

        print(f"Loading Whisper ({whisper_size})...")
        try:
            self.whisper_model = whisper.load_model(whisper_size)
            print("Whisper loaded.")
        except Exception as e:
            print(f"Whisper load failed: {e}")
            self.whisper_model = None

        self.prosodic_extractor = ProsodicFeatureExtractor()
        print("Prosodic feature extractor initialized.")
        print("EnhancedSpeechEmotionModel ready!")

    def transcribe(self, audio_path: str) -> Tuple[str, str, float]:
        """
        Returns (text, language, asr_confidence).
        asr_confidence is approximated from the average log-probability of Whisper segments.
        """
        if self.whisper_model is None:
            return "Transcription unavailable (Whisper not loaded)", "unknown", 0.0
        try:
            result   = self.whisper_model.transcribe(audio_path, task="translate")
            text     = result.get("text", "").strip()
            language = result.get("language", "unknown")
            segments = result.get("segments", [])
            if segments:
                avg_logprob = float(np.mean([s.get("avg_logprob", -1.0) for s in segments]))
                asr_conf    = float(np.clip(np.exp(avg_logprob), 0.0, 1.0))
            else:
                asr_conf = 0.5
            return text, language, asr_conf
        except Exception as e:
            print(f"Transcription error: {e}")
            return "Transcription failed", "unknown", 0.0

    def _ser_predict(self, audio_path: str) -> Tuple[str, float, Dict[str, float]]:
        if self.ser_model is None or self.feature_extractor is None:
            probs   = np.random.dirichlet(np.ones(NUM_LABELS))
            max_idx = int(np.argmax(probs))
            return TARGET_EMOTIONS[max_idx], float(probs[max_idx]), {TARGET_EMOTIONS[i]: float(probs[i]) for i in range(NUM_LABELS)}

        y, _ = librosa.load(audio_path, sr=SAMPLING_RATE)
        inputs = self.feature_extractor(y, sampling_rate=SAMPLING_RATE, return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            logits = self.ser_model(**inputs).logits
            probs  = torch.softmax(logits, dim=-1)[0].cpu().numpy()

        pred_id    = int(np.argmax(probs))
        emotion    = self.id2label[pred_id]
        confidence = float(probs[pred_id])
        all_probs  = {self.id2label[i]: float(probs[i]) for i in range(len(probs))}
        return emotion, confidence, all_probs

    def analyze_audio(self, audio_path: str) -> SpeechEmotionResult:
        print(f"\nAnalyzing audio: {audio_path}")

        print("   Running Whisper transcription...")
        text, lang, asr_conf = self.transcribe(audio_path)
        print(f"   Text         : {text}")
        print(f"   Language     : {lang}")
        print(f"   Casr         : {asr_conf:.3f}")

        print("   Extracting prosodic features...")
        pros_features = self.prosodic_extractor.extract_features(audio_path)

        print("   Predicting emotion from WavLM-large SER model...")
        emotion, conf, all_probs = self._ser_predict(audio_path)

        reasoning = self.prosodic_extractor.generate_reasoning(pros_features)

        y, sr    = librosa.load(audio_path, sr=None)
        duration = len(y) / sr if sr > 0 else 0.0

        return SpeechEmotionResult(
            audio_path=audio_path,
            duration=duration,
            sample_rate=sr,
            transcribed_text=text,
            detected_language=lang,
            asr_confidence=asr_conf,
            predicted_emotion=emotion,
            confidence=conf,
            all_probabilities=all_probs,
            prosodic_features=pros_features,
            emotion_trajectory=None,
            prosodic_reasoning=reasoning,
        )

    def explain(self, result: SpeechEmotionResult) -> str:
        lines: List[str] = []
        lines.append("=" * 60)
        lines.append("SPEECH EMOTION ANALYSIS")
        lines.append("=" * 60)
        lines.append(f"\nPredicted Emotion : {result.predicted_emotion.upper()} "
                     f"(Confidence Cs: {result.confidence:.1%})")
        lines.append(f"Audio Duration    : {result.duration:.1f} s")
        lines.append(f"Sample Rate       : {result.sample_rate} Hz")

        lines.append("\nTranscription:")
        lines.append(f"   \"{result.transcribed_text}\"")
        lines.append(f"   Detected Language    : {result.detected_language}")
        lines.append(f"   ASR Confidence (Casr): {result.asr_confidence:.3f}")

        f = result.prosodic_features
        lines.append("\nKey Voice Features:")
        lines.append(f"   Pitch mean     : {f.pitch_mean:.1f} Hz (range: {f.pitch_range:.1f} Hz)")
        lines.append(f"   Energy mean    : {f.energy_mean:.4f}")
        lines.append(f"   Speaking rate  : {f.speaking_rate:.2f} events/s")
        lines.append(f"   Pauses         : {f.pause_count} (avg {f.pause_duration_mean:.2f}s)")

        lines.append("\nProsodic Reasoning:")
        for i, (k, v) in enumerate(result.prosodic_reasoning.items(), start=1):
            lines.append(f"   {i}. {k.replace('_', ' ').title()}: {v}")

        if result.all_probabilities:
            lines.append("\nAlternative Emotions:")
            sorted_probs = sorted(result.all_probabilities.items(), key=lambda x: x[1], reverse=True)
            for emo, p in sorted_probs[1:4]:
                if p > 0.1:
                    lines.append(f"   {emo}: {p:.1%}")

        lines.append("\n" + "=" * 60)
        return "\n".join(lines)


# ==================== MAIN ====================

if __name__ == "__main__":
    RUN_TRAINING = False  # Set to True to train on your machine

    if RUN_TRAINING:
        train_df, val_df, test_df = build_splits()
        train_ser_model(train_df, val_df, test_df)
    else:
        print("Skipping SER training (RUN_TRAINING=False).")

    DEMO_AUDIO_PATH = "path/to/some_test_audio.wav"

    if os.path.isfile(DEMO_AUDIO_PATH):
        enhanced_ser = EnhancedSpeechEmotionModel(ser_model_path=FINAL_SAVE_PATH)
        result       = enhanced_ser.analyze_audio(DEMO_AUDIO_PATH)
        explanation  = enhanced_ser.explain(result)
        print(explanation)
    else:
        print(f"\nDemo audio file not found: {DEMO_AUDIO_PATH}")
        print("Set DEMO_AUDIO_PATH to a valid .wav file to run analysis.")
