import { Pressable, Text, View } from "react-native";
import { assessDanger, disasterOf, formatShortTime } from "./disaster";
import { missionStageLabel, missionStageNeedsAction, type MissionWorkStage } from "./mission-state";
import { c, styles } from "./styles";

/**
 * Thẻ tóm tắt một nhiệm vụ — DÙNG CHUNG cho hộp thông báo và danh sách nhiệm vụ.
 *
 * Trước đây thẻ này nằm gọn trong App.tsx và chỉ nhận được một bản ghi Thông báo,
 * nên tab Nhiệm vụ phải tự vẽ một kiểu thẻ khác. Hai kiểu thẻ cho cùng một thứ là
 * hai nơi phải sửa mỗi lần đổi cách hiển thị, và tệ hơn: người dùng đọc thẻ ở hộp
 * thông báo quen mắt rồi sang tab Nhiệm vụ lại phải học lại từ đầu.
 *
 * Nhận dữ liệu ĐÃ RÚT GỌN chứ không nhận cả bản ghi: hộp thông báo dựng nó từ một
 * mẩu tin, danh sách nhiệm vụ dựng nó từ chính nhiệm vụ. Bắt hai bên phải nặn dữ
 * liệu của mình thành hình một `Notification` là bắt danh sách nhiệm vụ giả làm
 * thông báo — và rồi sẽ có người thật sự tin vào cái vỏ đó.
 */
export function MissionSummaryCard({
  missionNo,
  incidentType,
  affectedPeople,
  place,
  createdAt,
  isNew = false,
  justViewed = false,
  role,
  stage,
  onPress,
}: {
  missionNo?: number | null;
  incidentType: string;
  affectedPeople: number;
  /** Nơi xảy ra sự việc — cùng quy tắc với màn chi tiết, xem `missionPlaceLabel`. */
  place?: string | null;
  /** ISO; rỗng thì bỏ hẳn dòng giờ chứ không in "Invalid Date". */
  createdAt?: string | null;
  isNew?: boolean;
  /** Nhiệm vụ vừa mở — đang được ghim lên đầu danh sách. */
  justViewed?: boolean;
  role: string;
  stage?: MissionWorkStage;
  onPress: () => void;
}) {
  const disaster = disasterOf(incidentType);
  const danger = assessDanger(incidentType, affectedPeople);
  const stageText = stage ? missionStageLabel(role, stage) : null;
  const stageNeedsAction = stage ? missionStageNeedsAction(role, stage) : false;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${missionNo != null ? `Nhiệm vụ số ${missionNo}, ` : ""}${disaster.label}, ${affectedPeople} người gặp nạn${stageText ? `, ${stageText}` : ""}`}
      style={({ pressed }) => [
        styles.missionCard,
        isNew && styles.missionCardNew,
        pressed && { opacity: 0.75 },
      ]}
    >
      <View style={[styles.stripe, { backgroundColor: danger.stripe }]} />
      <View style={styles.missionBody}>
        {/* Hàng đầu là DANH TÍNH của việc: nhiệm vụ số mấy. Đó là thứ người trực
            gọi cho nhau qua điện thoại, và khi danh sách có bảy tám thẻ cùng loại
            "Lũ lụt" thì tên thiên tai không phân biệt được thẻ nào với thẻ nào.

            Bản ghi cũ chưa có số hiệu thì lùi về tên thiên tai — thẻ không có
            tiêu đề còn khó đọc hơn là có một tiêu đề chung chung. */}
        <View style={styles.disasterRow}>
          <Text style={styles.disasterIcon}>{disaster.icon}</Text>
          <Text numberOfLines={1} style={styles.disasterName}>
            {missionNo != null ? `Nhiệm vụ số ${missionNo}` : disaster.label}
          </Text>
          {isNew ? (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>MỚI</Text>
            </View>
          ) : null}
          {/* Nói rõ VÌ SAO thẻ này nằm trên cùng. Không có nhãn thì người trực
              thấy danh sách tự đảo chỗ và nghi số liệu sai. */}
          {justViewed && !isNew ? (
            <View style={styles.viewedBadge}>
              <Text style={styles.viewedBadgeText}>VỪA XEM</Text>
            </View>
          ) : null}
          {/* Góc phải là SỐ NGƯỜI GẶP NẠN, nền đỏ — con số quyết định điều mấy xe,
              mấy người. Không xếp hạng mức nguy: nhiệm vụ nào cũng phải làm. */}
          <View style={styles.peopleBadge}>
            <Text style={styles.peopleBadgeText}>{affectedPeople} người gặp nạn</Text>
          </View>
        </View>

        {/* Dòng giữa là VIỆC PHẢI LÀM, viết theo vai của chính người đang đọc.
            Chưa tra được chặng thì lùi về tên thiên tai, đừng để trống một dòng
            rồi người đọc ngồi chờ nó hiện ra. */}
        {/* Mức nguy viết thành CHỮ, không chỉ là sọc màu bên trái.
            Màn chi tiết mở ra là thấy ngay dòng "CHƯA NGUY CẤP" to đùng; ở đây
            chỉ có một vệt màu nên hai màn hình nói hai chuyện khác nhau về cùng
            một nhiệm vụ. Ai phân biệt màu kém thì vệt màu còn không nói gì cả. */}
        <Text style={[styles.cardDanger, { color: danger.color }]}>⚠ {danger.label}</Text>

        <View style={styles.stageRow}>
          <Text
            style={[styles.stageText, stageNeedsAction && { color: c.amber }]}
            numberOfLines={2}
          >
            {stageText ?? disaster.label}
          </Text>
          {stageText ? <Text style={styles.stageDisaster}>{disaster.label}</Text> : null}
        </View>

        {/* Nơi xảy ra sự việc: câu hỏi ngay sau "việc gì" luôn là "ở đâu". Thiếu
            dòng này thì phải mở từng thẻ ra mới biết nhiệm vụ nào gần mình. */}
        {place ? (
          <Text numberOfLines={1} style={styles.cardPlace}>
            📍 {place}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          <Text style={styles.metaTime}>{createdAt ? `🕐 ${formatShortTime(createdAt)}` : ""}</Text>
          <Text style={styles.metaHint}>Xem chi tiết ›</Text>
        </View>
      </View>
    </Pressable>
  );
}
