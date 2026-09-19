import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FiMapPin, FiLoader } from 'react-icons/fi';
import { incidentsApi } from '../../services/api';
import toast from 'react-hot-toast';

/* ── GPS capture helper ──────────────────────────────────────────────────── */
function useGPS(setValue) {
  const [gpsStatus, setGpsStatus] = useState('idle'); // idle | acquiring | ok | denied | unavailable

  const capture = () => {
    if (!navigator.geolocation) {
      setGpsStatus('unavailable');
      toast('GPS not available on this device — enter location manually', { icon: 'ℹ️' });
      return;
    }
    setGpsStatus('acquiring');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setValue('latitude',  pos.coords.latitude.toFixed(6));
        setValue('longitude', pos.coords.longitude.toFixed(6));
        setValue('gps_accuracy', pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null);
        setGpsStatus('ok');
        toast.success(`GPS captured — accuracy ±${Math.round(pos.coords.accuracy || 0)} m`);
      },
      (err) => {
        setGpsStatus(err.code === 1 ? 'denied' : 'unavailable');
        const msg = err.code === 1
          ? 'Location permission denied — enter coordinates manually or allow location access'
          : 'Could not get GPS — enter location manually';
        toast(msg, { icon: '⚠️', duration: 5000 });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  };

  return { gpsStatus, capture };
}

/* ── GPS status indicator ─────────────────────────────────────────────────── */
function GpsIndicator({ status }) {
  const map = {
    idle:        { color: 'text-coal-500',   label: 'GPS not captured' },
    acquiring:   { color: 'text-amber-400',  label: 'Acquiring GPS…' },
    ok:          { color: 'text-success-400', label: 'GPS captured' },
    denied:      { color: 'text-danger-400',  label: 'Permission denied' },
    unavailable: { color: 'text-coal-500',   label: 'GPS unavailable' },
  };
  const { color, label } = map[status] || map.idle;
  return (
    <span className={`text-[10px] font-semibold flex items-center gap-1 ${color}`}>
      {status === 'acquiring'
        ? <FiLoader size={10} className="animate-spin"/>
        : <FiMapPin size={10}/>}
      {label}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   INCIDENT FORM
   Dual-mode: create (full fields + GPS) / edit (status + investigation fields)
   ════════════════════════════════════════════════════════════════════════════ */
export default function IncidentForm({ incident, mines = [], onSave, onCancel }) {
  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: incident || {
      incident_date:    new Date().toISOString().slice(0, 16),
      injuries_count:   0,
      fatalities_count: 0,
    },
  });
  const isEdit = !!incident?.id;
  const { gpsStatus, capture } = useGPS(setValue);
  const gpsOk = gpsStatus === 'ok';

  const onSubmit = async (data) => {
    try {
      // Strip empty GPS fields so DB stores NULL not empty string
      const payload = { ...data };
      if (!payload.latitude)  delete payload.latitude;
      if (!payload.longitude) delete payload.longitude;
      if (!payload.gps_accuracy) delete payload.gps_accuracy;

      if (isEdit) {
        await incidentsApi.update(incident.id, payload);
        toast.success('Incident updated');
      } else {
        await incidentsApi.create(payload);
        toast.success('Incident reported');
      }
      onSave();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save incident');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">

        {/* ── CREATE-ONLY FIELDS ─────────────────────────────────────── */}
        {!isEdit && (
          <>
            <div className="form-group">
              <label className="label">Mine *</label>
              <select {...register('mine_id', { required: 'Mine is required' })} className="select">
                <option value="">Select Mine</option>
                {mines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {errors.mine_id && <p className="text-xs text-danger-400 mt-1">{errors.mine_id.message}</p>}
            </div>

            <div className="form-group">
              <label className="label">Incident Type *</label>
              <select {...register('type', { required: 'Type is required' })} className="select">
                <option value="">Select Type</option>
                {['Roof Fall','Gas Ignition','Inundation','Slope Failure','Equipment Failure',
                  'Fire','Explosion','Electrical','Near Miss','Other']
                  .map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {errors.type && <p className="text-xs text-danger-400 mt-1">{errors.type.message}</p>}
            </div>

            <div className="form-group">
              <label className="label">Severity *</label>
              <select {...register('severity', { required: 'Severity is required' })} className="select">
                <option value="">Select Severity</option>
                {['fatal','serious','minor','near_miss']
                  .map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
              {errors.severity && <p className="text-xs text-danger-400 mt-1">{errors.severity.message}</p>}
            </div>

            <div className="form-group">
              <label className="label">Category</label>
              <input {...register('category')} className="input"
                placeholder="Ground Control, Gas Hazard…"/>
            </div>

            <div className="form-group col-span-full">
              <label className="label">Date &amp; Time *</label>
              <input type="datetime-local"
                {...register('incident_date', { required: 'Date/time is required' })}
                className="input"/>
              {errors.incident_date && <p className="text-xs text-danger-400 mt-1">{errors.incident_date.message}</p>}
            </div>

            {/* ── GPS ──────────────────────────────────────────────── */}
            <div className="form-group col-span-full">
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0">GPS Location</label>
                <GpsIndicator status={gpsStatus}/>
              </div>

              {/* Capture button */}
              <button
                type="button"
                onClick={capture}
                disabled={gpsStatus === 'acquiring'}
                className={`mb-3 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                  gpsOk
                    ? 'bg-success-600/15 border-success-500/30 text-success-400'
                    : 'bg-coal-800/60 border-coal-700/40 text-coal-300 hover:border-amber-500/40 hover:text-amber-400'
                }`}
              >
                {gpsStatus === 'acquiring'
                  ? <><FiLoader size={12} className="animate-spin"/> Acquiring GPS…</>
                  : gpsOk
                    ? <><FiMapPin size={12}/> GPS Captured — Recapture</>
                    : <><FiMapPin size={12}/> 📍 Capture GPS Location</>}
              </button>

              {/* Coordinate fields — always visible for manual entry */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-coal-500 uppercase tracking-wider mb-1 block">
                    Latitude {gpsOk && <span className="text-success-400">✓</span>}
                  </label>
                  <input
                    type="number" step="0.000001"
                    {...register('latitude', {
                      min: { value: -90,  message: 'Min −90' },
                      max: { value:  90,  message: 'Max +90' },
                    })}
                    className="input"
                    placeholder="e.g. 23.7957"
                  />
                  {errors.latitude && <p className="text-xs text-danger-400 mt-1">{errors.latitude.message}</p>}
                </div>
                <div>
                  <label className="text-[10px] text-coal-500 uppercase tracking-wider mb-1 block">
                    Longitude {gpsOk && <span className="text-success-400">✓</span>}
                  </label>
                  <input
                    type="number" step="0.000001"
                    {...register('longitude', {
                      min: { value: -180, message: 'Min −180' },
                      max: { value:  180, message: 'Max +180' },
                    })}
                    className="input"
                    placeholder="e.g. 86.4304"
                  />
                  {errors.longitude && <p className="text-xs text-danger-400 mt-1">{errors.longitude.message}</p>}
                </div>
              </div>

              {/* GPS accuracy display */}
              {gpsOk && watch('gps_accuracy') && (
                <p className="text-[10px] text-coal-600 mt-1.5">
                  Accuracy: ±{watch('gps_accuracy')} m
                  {parseInt(watch('gps_accuracy')) > 50 &&
                    <span className="text-amber-500 ml-1">(low accuracy — move to open area for better signal)</span>}
                </p>
              )}
              {(gpsStatus === 'denied' || gpsStatus === 'unavailable') && (
                <p className="text-[10px] text-coal-600 mt-1.5">
                  GPS unavailable — you can enter coordinates manually above, or leave blank.
                  The incident will still be saved without GPS.
                </p>
              )}

              {/* Hidden GPS accuracy field */}
              <input type="hidden" {...register('gps_accuracy')}/>
            </div>

            <div className="form-group col-span-full">
              <label className="label">Location in Mine</label>
              <input {...register('location_in_mine')} className="input"
                placeholder="Seam 14, Gallery C, Level 3…"/>
            </div>
          </>
        )}

        {/* ── COMMON (both create + edit) ────────────────────────── */}
        <div className="form-group">
          <label className="label">Injuries Count</label>
          <input type="number" min="0" {...register('injuries_count')} className="input"/>
        </div>

        <div className="form-group">
          <label className="label">Fatalities Count</label>
          <input type="number" min="0" {...register('fatalities_count')} className="input"/>
        </div>

        {!isEdit && (
          <div className="form-group col-span-full">
            <label className="label">Description *</label>
            <textarea
              {...register('description', { required: 'Description is required' })}
              rows={3} className="input resize-none"
              placeholder="Detailed description of what happened…"
            />
            {errors.description && <p className="text-xs text-danger-400 mt-1">{errors.description.message}</p>}
          </div>
        )}

        {/* ── EDIT-ONLY FIELDS ──────────────────────────────────────── */}
        {isEdit && (
          <>
            <div className="form-group col-span-full">
              <label className="label">Status</label>
              <select {...register('status')} className="select">
                {['open','under_investigation','closed','reported_to_dgms']
                  .map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="form-group col-span-full">
              <label className="label">Root Cause Analysis</label>
              <textarea {...register('root_cause')} rows={3} className="input resize-none"/>
            </div>
            <div className="form-group col-span-full">
              <label className="label">Corrective Measures</label>
              <textarea {...register('corrective_measures')} rows={3} className="input resize-none"/>
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-coal-700/50">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting
            ? 'Saving…'
            : isEdit ? 'Update Incident' : 'Report Incident'}
        </button>
      </div>
    </form>
  );
}
