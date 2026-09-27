import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Image, Animated, Alert, Modal, ScrollView } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, Patient, Report } from '../types';
import { useAppContext } from '../context/AppContext';
import Header from '../components/Header';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { getPatientPhotoUrl } from '../utils/uploadFile';

type HomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

type FilterType = 'alfabetica' | 'criacao' | 'atualizacao';
type FilterDirection = 'asc' | 'desc';

interface ActiveFilter {
  type: FilterType;
  direction: FilterDirection;
}

interface PatientCardItemProps {
  item: Patient;
  isExpanded: boolean;
  onToggleExpand: () => void;
  colors: {
    bg: string;
    text: string;
    inputBg: string;
    cardBg: string;
    cardBorder: string;
    greenBtn: string;
    blueBtn: string;
  };
  isDark: boolean;
  imageErrors: Record<string, boolean>;
  onImageError: (id: string, name: string) => void;
  navigation: HomeScreenNavigationProp;
  formatDate: (iso?: string) => string;
  handleDeleteReport: (reportId: string, patientId: string, reportTitle: string) => void;
}

const PatientCardItem = ({
  item,
  isExpanded,
  onToggleExpand,
  colors,
  isDark,
  imageErrors,
  onImageError,
  navigation,
  formatDate,
  handleDeleteReport,
}: PatientCardItemProps) => {
  const animatedValue = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
  const [shouldRender, setShouldRender] = useState(isExpanded);

  useEffect(() => {
    if (isExpanded) {
      setShouldRender(true);
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(animatedValue, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setShouldRender(false);
      });
    }
  }, [isExpanded]);

  const translateY = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-20, 0],
  });

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const lastReport = item.reports.length > 0 ? item.reports[item.reports.length - 1] : null;
  const photoUrl = getPatientPhotoUrl(item.foto_perfil_path);
  const hasPhotoError = !!imageErrors[item.id];

  // Caso o paciente tenha Nome Social, exibe o Nome Social; caso contrário, Nome Civil
  const displayName = (item.nome_social && item.nome_social.trim().length > 0)
    ? item.nome_social.trim()
    : item.nome_civil;

  return (
    <View style={styles.patientWrapper}>
      {/* Container de informações do paciente - tamanho mantido fixo */}
      <TouchableOpacity 
        style={[styles.patientCard, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]} 
        onPress={onToggleExpand}
        activeOpacity={0.85}
      >
        <View style={styles.patientInfo}>
          {photoUrl && !hasPhotoError ? (
            <Image
              source={{ uri: photoUrl }}
              style={styles.patientPhoto}
              onError={() => onImageError(item.id, displayName)}
            />
          ) : (
            <View style={styles.patientPhotoPlaceholder}>
              <Feather name="image" size={28} color={isDark ? '#ccc' : '#555'} />
            </View>
          )}
          <View style={styles.patientTextInfo}>
            <Text style={[styles.patientName, { color: colors.text }]}>{displayName}</Text>
            <Text style={[styles.patientId, { color: colors.text }]}>Nº PRONTUÁRIO: {item.prontuario}</Text>
            <Text style={[styles.patientLastReport, { color: colors.text }]}>
              ÚLTIMO RELATÓRIO: {lastReport ? formatDate(lastReport.atualizado_em || lastReport.criado_em) : 'Nenhum'}
            </Text>
          </View>
        </View>
        <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={24} color={colors.text} />
      </TouchableOpacity>

      {/* Aba de relatórios com animação de slide-in a partir de baixo */}
      {shouldRender && (
        <Animated.View style={[styles.expandedArea, { backgroundColor: isDark ? '#232b2f' : '#cbd5e1', transform: [{ translateY }], opacity }]}>
          <View style={styles.expandedButtonsRow}>
            <TouchableOpacity 
              style={[styles.blueBtn, { backgroundColor: colors.blueBtn }]}
              onPress={() => navigation.navigate('ReportForm', { patientId: item.id })}
            >
              <Text style={styles.actionBtnText}>Novo relatório</Text>
              <Feather name="file-text" size={16} color="#fff" style={{ marginLeft: 6 }} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.editBtn, { backgroundColor: '#4a5568' }]}
              onPress={() => navigation.navigate('PatientForm', { patientId: item.id })}
            >
              <Text style={styles.actionBtnText}>Editar paciente</Text>
              <Feather name="edit" size={16} color="#fff" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>

          {[...item.reports].reverse().map((r, i) => (
            <LinearGradient
              key={r.id}
              colors={r.status === 'Finalizado' ? (['#a8e063', '#56ab2f'] as const) : (['#f6d365', '#fda085'] as const)}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.reportCard}
            >
              <TouchableOpacity
                style={styles.reportMainContent}
                onPress={() => navigation.navigate('ReportForm', { patientId: item.id, reportId: r.id })}
                activeOpacity={0.8}
              >
                <Text style={styles.reportTitle}>Relatório {item.reports.length - i}</Text>
                <Text style={styles.reportDate}>
                  Data de última edição: {formatDate(r.atualizado_em || r.criado_em)}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.reportDeleteBtn}
                onPress={() => handleDeleteReport(r.id, item.id, `Relatório ${item.reports.length - i}`)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.7}
              >
                <Feather name="trash-2" size={18} color="#000" />
              </TouchableOpacity>
            </LinearGradient>
          ))}
        </Animated.View>
      )}
    </View>
  );
};

export default function Home() {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { theme, patients, deleteReport } = useAppContext();
  const isDark = theme === 'dark';
  
  const [search, setSearch] = useState('');
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  const [activeFilter, setActiveFilter] = useState<ActiveFilter | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const colors = {
    bg: isDark ? '#1a1a1a' : '#f0f0f0',
    text: isDark ? '#fff' : '#000',
    inputBg: isDark ? '#333' : '#d9e2e8',
    cardBg: isDark ? '#2c3539' : '#d9e2e8',
    cardBorder: isDark ? '#4a5568' : '#a0aec0',
    greenBtn: '#12a454',
    blueBtn: '#1d70b8',
  };

  const handleDeleteReport = (reportId: string, patientId: string, reportTitle: string) => {
    Alert.alert(
      'Excluir relatório',
      `Tem certeza de que deseja excluir o ${reportTitle}? O arquivo e dados vinculados serão apagados.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim',
          style: 'destructive',
          onPress: async () => {
            await deleteReport(reportId, patientId);
          },
        },
      ]
    );
  };

  const handleImageError = (id: string, name: string) => {
    if (!imageErrors[id]) {
      setImageErrors(prev => ({ ...prev, [id]: true }));
      Alert.alert(
        'Erro ao carregar foto',
        `Não foi possível exibir a foto do paciente "${name}". Exibindo imagem padrão.`
      );
    }
  };

  // Alterna o filtro: 1º clique -> crescente (seta p/ cima), 2º clique -> decrescente (seta p/ baixo), 3º clique -> desativado
  const handleFilterPress = (type: FilterType) => {
    if (!activeFilter || activeFilter.type !== type) {
      setActiveFilter({ type, direction: 'asc' });
    } else if (activeFilter.direction === 'asc') {
      setActiveFilter({ type, direction: 'desc' });
    } else {
      setActiveFilter(null);
    }
  };

  // Pesquisa por Nome Civil, Nome Social ou Prontuário
  const searchLower = search.toLowerCase().trim();
  const filteredPatients = patients.filter((p) => {
    if (!searchLower) return true;
    const nomeCivilMatch = p.nome_civil ? p.nome_civil.toLowerCase().includes(searchLower) : false;
    const nomeSocialMatch = p.nome_social ? p.nome_social.toLowerCase().includes(searchLower) : false;
    const prontuarioMatch = p.prontuario ? p.prontuario.includes(searchLower) : false;
    return nomeCivilMatch || nomeSocialMatch || prontuarioMatch;
  });

  // Ordenação dos pacientes baseada no filtro ativo e direção
  const sortedPatients = [...filteredPatients].sort((a, b) => {
    if (!activeFilter) return 0;
    const { type, direction } = activeFilter;

    if (type === 'alfabetica') {
      const nameA = (a.nome_social?.trim() || a.nome_civil).toLowerCase();
      const nameB = (b.nome_social?.trim() || b.nome_civil).toLowerCase();
      return direction === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    }

    if (type === 'criacao') {
      const timeA = a.criado_em || a.created_at ? new Date(a.criado_em || a.created_at || '').getTime() : 0;
      const timeB = b.criado_em || b.created_at ? new Date(b.criado_em || b.created_at || '').getTime() : 0;
      if (timeA && timeB) return direction === 'asc' ? timeA - timeB : timeB - timeA;
      // Fallback: ordena pelo prontuário como string
      const pA = a.prontuario || '';
      const pB = b.prontuario || '';
      return direction === 'asc' ? pA.localeCompare(pB) : pB.localeCompare(pA);
    }

    if (type === 'atualizacao') {
      const getLatestReportTime = (p: Patient) => {
        let maxTime = p.atualizado_em || p.criado_em || p.created_at ? new Date(p.atualizado_em || p.criado_em || p.created_at || '').getTime() : 0;
        if (p.reports && p.reports.length > 0) {
          p.reports.forEach((r) => {
            const t = new Date(r.atualizado_em || r.criado_em).getTime();
            if (t > maxTime) maxTime = t;
          });
        }
        return maxTime;
      };
      const timeA = getLatestReportTime(a);
      const timeB = getLatestReportTime(b);
      return direction === 'asc' ? timeA - timeB : timeB - timeA;
    }

    return 0;
  });

  const handleScroll = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setShowScrollTop(offsetY > 100);
  };

  const scrollToTop = () => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const toggleExpand = (id: string) => {
    setExpandedPatientId(expandedPatientId === id ? null : id);
  };

  // Converte ISO date para DD/MM/AAAA
  const formatDate = (iso?: string): string => {
    if (!iso) return 'N/A';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Header />
      
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: colors.inputBg }]}>
          <Feather name="search" size={20} color={isDark ? '#aaa' : '#555'} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Pesquisar paciente"
            placeholderTextColor={isDark ? '#aaa' : '#555'}
            value={search}
            onChangeText={setSearch}
          />
          <TouchableOpacity 
            style={[styles.filterBtn, activeFilter !== null && styles.filterBtnActive]}
            onPress={() => setShowFilterModal(true)}
            activeOpacity={0.7}
          >
            <Feather 
              name="filter" 
              size={20} 
              color={activeFilter !== null ? colors.greenBtn : (isDark ? '#aaa' : '#555')} 
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.greenBtn, { backgroundColor: colors.greenBtn }]}
          onPress={() => navigation.navigate('PatientForm')}
        >
          <Text style={styles.btnText}>Novo paciente</Text>
          <Feather name="plus-circle" size={20} color="#fff" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </View>

      {patients.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.text }]}>Nenhum paciente cadastrado</Text>
        </View>
      ) : sortedPatients.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.text }]}>Nenhum paciente encontrado na pesquisa</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={sortedPatients}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <PatientCardItem
              item={item}
              isExpanded={expandedPatientId === item.id}
              onToggleExpand={() => toggleExpand(item.id)}
              colors={colors}
              isDark={isDark}
              imageErrors={imageErrors}
              onImageError={handleImageError}
              navigation={navigation}
              formatDate={formatDate}
              handleDeleteReport={handleDeleteReport}
            />
          )}
          contentContainerStyle={styles.listContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        />
      )}

      {showScrollTop && (
        <TouchableOpacity style={styles.scrollTopBtn} onPress={scrollToTop}>
          <Text style={styles.scrollTopText}>Voltar para o topo</Text>
        </TouchableOpacity>
      )}

      {/* Modal de Filtros e Ordenação */}
      <Modal
        visible={showFilterModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowFilterModal(false)}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            style={[styles.modalContent, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Filtrar Pacientes</Text>
              <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                <Feather name="x" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={{ marginVertical: 10 }}>
              {([
                { type: 'alfabetica' as FilterType, label: 'Ordem Alfabética' },
                { type: 'criacao' as FilterType, label: 'Ordem de Criação' },
                { type: 'atualizacao' as FilterType, label: 'Ordem de Atualização' },
              ]).map((opt) => {
                const isSelected = activeFilter?.type === opt.type;
                const direction = isSelected ? activeFilter.direction : null;

                return (
                  <TouchableOpacity
                    key={opt.type}
                    style={[
                      styles.filterOption,
                      isSelected && { backgroundColor: isDark ? '#3d4852' : '#cbd5e1' },
                    ]}
                    onPress={() => handleFilterPress(opt.type)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.filterOptionText, { color: colors.text, fontWeight: isSelected ? 'bold' : 'normal' }]}>
                      {opt.label}
                    </Text>

                    {isSelected && (
                      <View style={styles.filterBadge}>
                        <Feather 
                          name={direction === 'asc' ? 'arrow-up' : 'arrow-down'} 
                          size={18} 
                          color={colors.greenBtn} 
                        />
                        <Text style={[styles.filterDirectionText, { color: colors.greenBtn }]}>
                          {direction === 'asc' ? 'Crescente' : 'Decrescente'}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.closeModalBtn, { backgroundColor: colors.blueBtn }]}
              onPress={() => setShowFilterModal(false)}
            >
              <Text style={styles.closeModalBtnText}>Concluir</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchContainer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 25,
    marginBottom: 15,
  },
  searchInput: { flex: 1, marginLeft: 10, marginRight: 10, fontSize: 16 },
  filterBtn: { padding: 4 },
  filterBtnActive: { transform: [{ scale: 1.1 }] },
  greenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 25,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 40 },
  emptyText: { fontSize: 18, fontWeight: '500' },
  listContent: { paddingHorizontal: 20, paddingBottom: 80 },
  patientWrapper: { width: '100%', marginBottom: 12 },
  patientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
  },
  patientInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  patientPhoto: { width: 50, height: 50, borderRadius: 25, marginRight: 15 },
  patientPhotoPlaceholder: {
    width: 50, height: 50, borderRadius: 25, marginRight: 15,
    backgroundColor: '#999', justifyContent: 'center', alignItems: 'center'
  },
  patientTextInfo: { flex: 1 },
  patientName: { fontSize: 16, fontWeight: 'bold' },
  patientId: { fontSize: 12, opacity: 0.8, marginTop: 2 },
  patientLastReport: { fontSize: 10, opacity: 0.6, marginTop: 2 },
  expandedArea: {
    marginTop: 6,
    padding: 12,
    borderRadius: 10,
  },
  expandedButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  blueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 20,
    paddingHorizontal: 12,
    flex: 1,
    marginRight: 6,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 20,
    paddingHorizontal: 12,
    flex: 1,
    marginLeft: 6,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  reportCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  reportMainContent: {
    flex: 1,
    paddingRight: 10,
  },
  reportDeleteBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportTitle: { fontSize: 16, fontWeight: 'bold', color: '#000' },
  reportDate: { fontSize: 12, color: '#000', marginTop: 4 },
  scrollTopBtn: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  scrollTopText: { color: '#fff', fontWeight: 'bold' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  filterGroupTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    opacity: 0.7,
    marginBottom: 8,
  },
  filterOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
  },
  filterOptionText: {
    fontSize: 15,
  },
  filterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterDirectionText: {
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 5,
  },
  closeModalBtn: {
    marginTop: 15,
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeModalBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
