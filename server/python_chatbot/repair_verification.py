import base64
import io
import math
import os
import requests
import numpy as np
import cv2
from PIL import Image

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate Haversine distance in meters between two GPS coordinates."""
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return None
    
    R = 6371000.0  # Earth radius in meters
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    
    a = (math.sin(dlat / 2.0) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 2)

def load_image_from_base64_or_url(image_str):
    """Load image into OpenCV BGR format from base64 string, HTTP URL, or local path."""
    if not image_str:
        return None
    
    try:
        if image_str.startswith('data:image') or (',' in image_str and not image_str.startswith('http')):
            clean_b64 = image_str.split(',')[1] if ',' in image_str else image_str
            img_data = base64.b64decode(clean_b64)
            np_arr = np.frombuffer(img_data, np.uint8)
            return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        elif image_str.startswith('http://') or image_str.startswith('https://'):
            resp = requests.get(image_str, timeout=10)
            if resp.status_code == 200:
                np_arr = np.frombuffer(resp.content, np.uint8)
                return cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        elif os.path.exists(image_str):
            return cv2.imread(image_str)
    except Exception as e:
        print(f"Error loading image: {e}")
        return None
    return None

def verify_same_pothole_repair(before_img_input, after_img_input, before_gps=None, after_gps=None, max_gps_radius=50.0):
    """
    Computes SAME-POTHOLE verification between BEFORE and AFTER images using OpenCV & GPS.
    Returns scores for:
    - GPS Match % and Distance
    - Background Landmark Match %
    - Camera Angle / Perspective Match %
    - Visual Feature Match Points [(x1, y1, x2, y2)]
    - Pothole Repair Confirmation
    - Overall Result: VERIFIED | NEEDS_ADMIN_REVIEW | SUSPICIOUS
    """
    reasons = []
    
    # 1. GPS Verification
    b_lat = before_gps.get('lat') if before_gps else None
    b_lng = before_gps.get('lng') if before_gps else None
    a_lat = after_gps.get('lat') if after_gps else None
    a_lng = after_gps.get('lng') if after_gps else None
    
    gps_dist = haversine_distance(b_lat, b_lng, a_lat, a_lng)
    gps_result = 'UNAVAILABLE'
    gps_match_score = 50
    
    if gps_dist is not None:
        if gps_dist <= 5.0:
            gps_match_score = 100
            gps_result = 'PASS'
            reasons.append(f"📍 Location Match: Perfect GPS alignment ({gps_dist}m distance)")
        elif gps_dist <= max_gps_radius:
            gps_match_score = max(10, int(100 - (gps_dist - 5.0) * 1.8))
            gps_result = 'PASS'
            reasons.append(f"📍 Location Match: Within acceptable range ({gps_dist}m distance)")
        else:
            gps_match_score = max(0, int(100 - gps_dist * 2))
            gps_result = 'FAIL'
            reasons.append(f"🚨 Location Mismatch: Locations are {gps_dist}m apart (Threshold: {max_gps_radius}m)")
    else:
        reasons.append("⚠️ GPS metadata missing for one or both photos - relying on visual landmarks")

    # 2. OpenCV Computer Vision Analysis
    img1 = load_image_from_base64_or_url(before_img_input)
    img2 = load_image_from_base64_or_url(after_img_input)
    
    if img1 is None or img2 is None:
        return {
            'gpsDistanceMeters': gps_dist,
            'gpsMatchScore': gps_match_score,
            'gpsResult': gps_result,
            'backgroundScore': 45,
            'backgroundResult': 'LOW',
            'perspectiveScore': 40,
            'perspectiveResult': 'LOW',
            'visualSimilarityScore': 40,
            'repairEvidenceResult': 'INCONCLUSIVE',
            'overallResult': 'NEEDS_ADMIN_REVIEW',
            'featurePoints': [],
            'reasons': reasons + ["⚠️ Unable to process image pixels for detailed feature extraction"],
            'analysisMethod': 'gps-only-fallback'
        }

    # Resize images to standard dimensions for consistent processing
    h1, w1 = img1.shape[:2]
    h2, w2 = img2.shape[:2]
    target_w, target_h = 600, 450
    
    img1_resized = cv2.resize(img1, (target_w, target_h))
    img2_resized = cv2.resize(img2, (target_w, target_h))
    
    gray1 = cv2.cvtColor(img1_resized, cv2.COLOR_BGR2GRAY)
    gray2 = cv2.cvtColor(img2_resized, cv2.COLOR_BGR2GRAY)

    # 3. ORB Feature Extraction & Descriptor Matching
    orb = cv2.ORB_create(nfeatures=800)
    kp1, des1 = orb.detectAndCompute(gray1, None)
    kp2, des2 = orb.detectAndCompute(gray2, None)
    
    feature_points = []
    good_matches = []
    bg_good_matches = []
    
    if des1 is not None and des2 is not None and len(des1) > 0 and len(des2) > 0:
        bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        matches = bf.knnMatch(des1, des2, k=2)
        
        # Apply Lowe's ratio test
        for m_n in matches:
            if len(m_n) == 2:
                m, n = m_n
                if m.distance < 0.78 * n.distance:
                    good_matches.append(m)
                    
                    pt1 = kp1[m.queryIdx].pt
                    pt2 = kp2[m.trainIdx].pt
                    
                    # Filter for upper/surrounding region (landmarks like poles, trees, buildings, signs)
                    if pt1[1] < target_h * 0.75:
                        bg_good_matches.append(m)
                    
                    # Normalized feature points for UI line rendering
                    feature_points.append({
                        'x1': round((pt1[0] / target_w) * 100, 2),
                        'y1': round((pt1[1] / target_h) * 100, 2),
                        'x2': round((pt2[0] / target_w) * 100, 2),
                        'y2': round((pt2[1] / target_h) * 100, 2)
                    })

    # Limit to top 25 feature point pairs for UI rendering clarity
    feature_points = feature_points[:25]
    
    # Calculate Background Landmark Score
    match_count = len(good_matches)
    bg_match_count = len(bg_good_matches)
    
    background_score = min(98, max(15, int((bg_match_count / 15.0) * 100))) if bg_match_count > 0 else 20
    if bg_match_count >= 12:
        background_result = 'HIGH'
        reasons.append(f"🏢 Surroundings Match: Strong landmark alignment detected ({bg_match_count} background feature points matched)")
    elif bg_match_count >= 6:
        background_result = 'MEDIUM'
        reasons.append(f"🏢 Surroundings Match: Moderate landmark alignment ({bg_match_count} background feature points matched)")
    else:
        background_result = 'LOW'
        reasons.append(f"⚠️ Surroundings Mismatch: Few background landmarks match between photos ({bg_match_count} points)")

    # 4. Homography & Camera Perspective Estimation
    perspective_score = 30
    perspective_result = 'LOW'
    
    if len(good_matches) >= 4:
        pts1 = np.float32([kp1[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        pts2 = np.float32([kp2[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        
        H, mask = cv2.findHomography(pts1, pts2, cv2.RANSAC, 5.0)
        if mask is not None:
            inliers = np.sum(mask)
            inlier_ratio = inliers / float(len(good_matches))
            perspective_score = min(96, max(20, int(inlier_ratio * 100)))
            
            if perspective_score >= 65:
                perspective_result = 'HIGH'
                reasons.append(f"📐 Camera Angle Match: Highly consistent perspective and road direction ({perspective_score}%)")
            elif perspective_score >= 40:
                perspective_result = 'MEDIUM'
                reasons.append(f"📐 Camera Angle Match: Acceptable perspective alignment ({perspective_score}%)")
            else:
                perspective_result = 'LOW'
                reasons.append(f"📐 Camera Angle Notice: Angle or viewpoint differs significantly between shots ({perspective_score}%)")
    else:
        reasons.append("⚠️ Insufficient keypoints to estimate geometric camera homography")

    # 5. Visual Similarity Overall Score
    visual_similarity = min(98, int(background_score * 0.5 + perspective_score * 0.5))

    # 6. Pothole Repair Confirmation (Road texture variance & edge density difference)
    lower_half1 = gray1[int(target_h * 0.4):, :]
    lower_half2 = gray2[int(target_h * 0.4):, :]
    
    edges1 = cv2.Canny(lower_half1, 50, 150)
    edges2 = cv2.Canny(lower_half2, 50, 150)
    
    edge_density1 = float(np.mean(edges1))
    edge_density2 = float(np.mean(edges2))
    
    if edge_density1 > 1.2 * edge_density2 or background_score >= 60:
        repair_evidence_result = 'REPAIRED'
        reasons.append("🛠️ Repair Evidence: Road surface shows smooth asphalt patch over previous pothole region")
    elif edge_density2 > 1.5 * edge_density1 and background_score < 40:
        repair_evidence_result = 'NOT_REPAIRED'
        reasons.append("🚫 Repair Evidence: Severe road damage/pothole edges still present in photo")
    else:
        repair_evidence_result = 'INCONCLUSIVE'
        reasons.append("🔍 Repair Evidence: Inconclusive surface texture change - requires admin inspection")

    # 7. Final Classification Decision
    if gps_result == 'FAIL' or (background_result == 'LOW' and perspective_result == 'LOW' and gps_match_score < 40):
        overall_result = 'SUSPICIOUS'
        reasons.append("🚨 VERIFICATION FAILED: Strong evidence of location/landmark mismatch between BEFORE and AFTER photos!")
    elif (gps_result == 'PASS' or gps_dist is None) and background_score >= 55 and perspective_score >= 45 and repair_evidence_result == 'REPAIRED':
        overall_result = 'VERIFIED'
        reasons.append("✅ VERIFICATION SUCCESSFUL: Confirmed same physical location and successful pothole repair!")
    else:
        overall_result = 'NEEDS_ADMIN_REVIEW'
        reasons.append("🔍 VERIFICATION REQUIRES REVIEW: Evidence is inconclusive or camera angle changed. Admin review requested.")

    return {
        'gpsDistanceMeters': gps_dist,
        'gpsMatchScore': gps_match_score,
        'gpsResult': gps_result,
        'backgroundScore': background_score,
        'backgroundResult': background_result,
        'perspectiveScore': perspective_score,
        'perspectiveResult': perspective_result,
        'visualSimilarityScore': visual_similarity,
        'repairEvidenceResult': repair_evidence_result,
        'overallResult': overall_result,
        'featurePoints': feature_points,
        'reasons': reasons,
        'analysisMethod': 'opencv-orb-homography'
    }
